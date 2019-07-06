---
layout: post
title: "记一次 Java 服务性能优化"
category: blog
tags: [Java, Optimization, Efficiency]
date: 2019-07-06 08:00:06 +0800
comments: true
---

## 背景
---

前段时间我们的服务遇到了性能瓶颈，可能由于前期需求太急没有注意这方面的优化，到了要还技术债的时候就非常痛苦了。

在很低的 QPS 压力下服务器负载就能达到 10-20，CPU 占用 60% 以上，而且在每次流量峰值时接口都会大量报错，虽然使用了服务熔断框架 Hystrix，但熔断后服务却迟迟不能恢复。每次变更上线更是提心吊胆，担心会成为压死骆驼的最后一根稻草。

在需求终于缓下来后，leader 给我们定下目标，限我们在两周内把服务性能问题彻底解决。

近两周的排查和梳理中，发现并解决了多个性能瓶颈，修改了系统熔断方案，最终服务能处理的 QPS 翻倍，且能实现在极高 QPS（3-4倍）压力下服务能正常熔断，且能在压力降低后迅速恢复正常，以下是问题的排查和解决过程。

{{ site.article.copyright }}

## 服务器高CPU、高负载
---
首先要解决的问题就是服务导致服务器整体负载高、CPU 高的问题。

我们的服务整体可以归纳为从某个存储或远程调用获取到一批数据，然后就对这批数据进行各种花式变换，最后返回。由于数据变换的流程长、操作多，系统 CPU 高一些会正常，但平常情况下就 CPU us 50% 以上，还是有些夸张了。

我们都知道，可以使用 top 命令在服务器上查询系统内各个进程的 CPU 和内存占用情况。可是 JVM 是 Java 应用的领地，想查看 JVM 里各个线程的资源占用情况该用什么工具呢？

jmc 是可以的，但使用它比较麻烦，我们还有另一种选择，就是使用 `jtop`，jtop 只是一个 jar 包，我们可以很方便地把它复制到服务器上，获取到 java 应用的 pid 后，使用 `java -jar jtop.jar [options] <pid>` 即可。
jtop 会使用默认参数 `-stack n ` 打印出最耗 CPU 的 5 种线程栈。

形如：

```
Heap Memory: INIT=134217728  USED=230791968  COMMITED=450363392  MAX=1908932608
NonHeap Memory: INIT=2555904  USED=24834632  COMMITED=26411008  MAX=-1
GC PS Scavenge  VALID  [PS Eden Space, PS Survivor Space]  GC=161  GCT=440
GC PS MarkSweep  VALID  [PS Eden Space, PS Survivor Space, PS Old Gen]  GC=2  GCT=532
ClassLoading LOADED=3118  TOTAL_LOADED=3118  UNLOADED=0
Total threads: 608  CPU=2454 (106.88%)  USER=2142 (93.30%)
NEW=0  RUNNABLE=6  BLOCKED=0  WAITING=2  TIMED_WAITING=600  TERMINATED=0

main  TID=1  STATE=RUNNABLE  CPU_TIME=2039 (88.79%)  USER_TIME=1970 (85.79%) Allocted: 640318696
    com.google.common.util.concurrent.RateLimiter.tryAcquire(RateLimiter.java:337)
    io.zhenbianshu.TestFuturePool.main(TestFuturePool.java:23)

RMI TCP Connection(2)-127.0.0.1  TID=2555  STATE=RUNNABLE  CPU_TIME=89 (3.89%)  USER_TIME=85 (3.70%) Allocted: 7943616
    sun.management.ThreadImpl.dumpThreads0(Native Method)
    sun.management.ThreadImpl.dumpAllThreads(ThreadImpl.java:454)
    me.hatter.tools.jtop.rmi.RmiServer.listThreadInfos(RmiServer.java:59)
    me.hatter.tools.jtop.management.JTopImpl.listThreadInfos(JTopImpl.java:48)
    sun.reflect.NativeMethodAccessorImpl.invoke0(Native Method)

    ... ...
```

通过观察线程栈，我们可以找到要优化的代码点。

在我们的代码里，发现了很多 json 序列化和反序列化和 Bean 复制耗 CPU 的点，之后通过代码优化，提升 Bean 的复用，减少复制，使用 PB 替代 json 等方式，大大降低了 CPU 压力。

## 熔断框架优化
---
服务熔断框架上，我们选用了 Hystrix，虽然它已经宣布不再维护，更推荐使用 resilience4j，而且业内也有阿里开源的 sentinel，但由于部门内技术栈都是 Hystrix，而且它也没有明显的短板，就接着用下去了。

先介绍一下基本情况，我们在接口最外层和内层 RPC 调用处添加了 Hystrix 注解，隔离方式都是线程池模式，接口处超时时间设置为 1000ms，最大线程数是 2000，内部 RPC 调用的超时时间设置为 200ms，最大线程数是 500。

#### 响应时间不正常
要解决的第一个问题是接口的响应时间不正常。在观察接口的 access 日志时，我发现接口有耗时为 1200ms 的请求，有些甚至达到了 2000ms 以上。这种情况对于线程池隔离方式是不可能发生的，因为线程池模式下，Hystrix 会创建一个新的线程去执行真正的业务逻辑，而主线程则一直在等待，一旦等待超时，主线程是可以立刻返回的。所以接口耗时超过超时时间，问题很可能发生在 Hystrix 框架或更底层的 Spring 或系统层。

这时就只能来观察线程的表现了，于是我使用 jstack 打印出线程栈，并将多次打印的结果制作成火焰图（参见 [应用调试工具-火焰图]({{ site.baseurl }}/2019/04/application_debug_tools_flamegraph.html)）来观察。

<img src="/images/2019/hystrix_lock.png" />

如上图，可以看到很多线程都停在 `LockSupport.park(LockSupport.java:175)` 处，这些线程都被锁住了，向下看来源发现竟然是 `HystrixTimer.addTimerListener(HystrixTimer.java:106)`, 再向下就是我们的业务代码了。

这些 TimerListener 的作用， Hystrix 注释里解释它是 HystrixCommand 来处理异步线程的超时的。这些 TimerListener 会在调用超时时执行，将超时结果返回。而在调用量大时，进入线程池时这些 TimerListener 的设置就会因为锁而阻塞，而这些 TimerListener 的设置被阻塞后，就会导致接口设置的超时时间不生效。

要解决这个问题，只能修改服务的隔离策略，将 Hystrix 的隔离策略改为信号量模式。信号量模式下，Hystrix 会在每次执行 HystrixCommand 时获取一次信号量，在执行结束后还回。由于信号量的操作效率非常高，而且没有其他附加操作，所以在使用信号量隔离模式时不会有其他性能损耗。

但使用信号量隔离模式也要注意一个问题，就是信号量只能限制方法是否能够进入，如果可以进入执行，则在原来的主线程内执行，执行的过程中 Hystrix 是无法干预的，只能在主线程返回后来判断接口是否超时，这可能会导致有部分请求耗时超长，长时间占用一个信号量，没法返回。

不过对于我们的接口来说，信号量隔离模式这些弊端是可以接受的。在修改了 Hystrix 的隔离模式后，接口的平均耗时就稳定了，而且由于方法都在主线程执行，少了 Hystrix 线程池维护和主线程与 Hystrix 线程的上下文切换，系统 CPU 又有进一步下降。

#### 无法按预期熔断
另外，熔断还有一个问题是它不能按照预期的方式进行，我们认为流量在非常大的情况下应该会持续熔断时，而 Hystrix 总表现为半熔断半执行。

开始时，我们对日志进行观察，由于日志被设置成异步，看不到实时日志，而且有大量的报错信息干扰，过程痛苦而低效。后来得知 Hystrix 还有可视化界面后，终于被解救出来。

Hystrix 可视化模式分为服务端和客户端，服务端就是我们要观察的服务，需要在服务内添加一个接口来输出 Metrics 信息。


```java
```

另外，还要在客户端将这些信息展示出来。

通过可视化界面，Hystrix 的状态就展示得非常清楚了，我们就可以根据这些状态对它的熔断状态进行调估了。


严格限制并发量

#### 熔断时高负载导致无法恢复

减少日志和异常栈的打印。

日志打印获取异常栈性能低下。



## Spring 数据绑定异常
---
在查看线程栈时，还偶然发现了另一个奇怪的问题。

spring 参数绑定问题。

## 小结
---


{{ site.article.summary }}
