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

在我们的代码里，发现了很多 json 序列化和反序列化和 Bean 复制耗 CPU 的点，之后我们通过代码优化，提升 Bean 的复用，减少复制，使用 PB 替代 json 等方式，大大降低了 CPU 压力。

## 熔断框架优化
---
服务熔断框架上，我们选用了 Hystrix，虽然它已经宣布不再维护，更推荐使用 resilience4j，而且业内也有阿里开源的 sentinel，但由于部门内技术栈都是 Hystrix，而且它也没有明显的短板，就接着用下去了。

#### 响应时间不正常

使用了线程池的隔离策略，会产生多个 timer_task，timer_task 在添加时会加锁，锁冲突会造成接口响应时间超出预期。

#### 无法按预期熔断




严格限制并发量。



3. 异常线程栈。

spring 参数绑定问题。



4. 熔断时高负载导致无法恢复。

减少日志和异常栈的打印。

日志打印获取异常栈性能低下。

## 小结
---


{{ site.article.summary }}
