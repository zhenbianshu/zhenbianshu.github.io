---
layout: post
title: "如何计算服务限流的配额"
date: 2020-03-17 10:00:06 +0800
category: blog
tags: [Project, Isolation, Profession, Experience]
comments: true

---
## 问题
---
#### 请求被限流
之前的文章提到过我们服务使用 Hystrix 进行服务限流，使用的是信号量方式，并根据接口的响应时间和服务的峰值 QPS 设置了限流的配额。

限流配额的计算方式为：

我们接口单机单个接口的峰值 QPS 为 1000，平均影响时长 15ms，我们认为 Hystrix 的信号量是并发量，那么一个信号量在一秒内能允许 `1000ms/15ms~66` 个请求通过，那么服务 1000QPS 配置 15 个信号量就足够了。

当然这是在忽略上下文切换和 GC 时间的情况下，考虑上这些因素，每个并发量每秒能服务的时长约为 900ms，用同样的公式计算所需要的信号量是 17，为了应付突发流量，我将这个值设置为了 30。

本以为这样就高枕无忧了，没想到看错误日志中偶然发现了有报错：

```bash
HystrixRuntimeException occurred! , failureType:REJECTED_SEMAPHORE_EXECUTION, message:apiHystrixKey could not acquire a semaphore for execution and fallback failed.
```
我把信号量配置提高到了 50，没想到还是没看到问题有明显好转，这就比较诡异了。

{{ site.article.copyright }}

## 解决
---

#### 排查步骤
首先我列了一下排查的步骤，也整理一下出现这种问题的可能。

1. 看正常请求的平均耗时，排除真实 block 的可能。
    接口平均耗时 17ms，QPS 1000，如果代码都被 block 在某处，接口耗时一定会突增。
2. 查看一下 hystrix 代码看是否可能有情况导致信号量未释放。
    简单扫了一遍 hystrix 相关代码，信号量的释放在请求结束的 callback 里，如果有泄漏，一定会导致可用信号量越来越少，最终为 0。
3. 写一个小 demo，压测看是否能复现。
    在 demo 里运行，问题只在刚启动服务未初始化完成时复现，后续就平稳了。
    
#### Jdk 的 Bug ？
从整体上看不出来，就只好从微观时间点上看了，可这个问题出现是一瞬间的事，jstack 也无能为力，虽然 jmc 倒是合适，但它部署有点费劲，而且还会在观察的时候影响到服务，于是优先从历史时间点上排查。

从错误日志里找了一个服务拒绝数校多的时间点，再观察服务当时的状态。错误日志上除了一些请求被拒绝的报错外就没有其他的了，但我在 gclog 里发现了奇怪的日志。

```
2020-03-17T13:01:26.281+0800: 89732.109: Application time: 2.1373599 seconds
2020-03-17T13:01:26.308+0800: 89732.136: Total time for which application threads were stopped: 0.0273134 seconds, Stopping threads took: 0.0008935 seconds
2020-03-17T13:01:26.310+0800: 89732.137: Application time: 0.0016111 seconds
2020-03-17T13:01:26.336+0800: 89732.163: [GC (Allocation Failure) 2020-03-17T13:01:26.336+0800: 89732.164: [ParNew
Desired survivor size 429490176 bytes, new threshold 4 (max 4)
- age 1: 107170544 bytes, 107170544 total
- age 2: 38341720 bytes, 145512264 total
- age 3: 6135856 bytes, 151648120 total
- age 4: 152 bytes, 151648272 total
: 6920116K->214972K(7549760K), 0.0739801 secs] 9292943K->2593702K(11744064K), 0.0756263 secs] [Times: user=0.65 sys=0.23, real=0.08 secs]
2020-03-17T13:01:26.412+0800: 89732.239: Total time for which application threads were stopped: 0.1018416 seconds, Stopping threads took: 0.0005597 seconds
2020-03-17T13:01:26.412+0800: 89732.239: Application time: 0.0001873 seconds
2020-03-17T13:01:26.438+0800: 89732.265: [GC (GCLocker Initiated GC) 2020-03-17T13:01:26.438+0800: 89732.265: [ParNew
Desired survivor size 429490176 bytes, new threshold 4 (max 4)
- age 1: 77800 bytes, 77800 total
- age 2: 107021848 bytes, 107099648 total
- age 3: 38341720 bytes, 145441368 total
- age 4: 6135784 bytes, 151577152 total
: 217683K->215658K(7549760K), 0.0548512 secs] 2596413K->2594388K(11744064K), 0.0561721 secs] [Times: user=0.49 sys=0.18, real=0.05 secs]
2020-03-17T13:01:26.495+0800: 89732.322: Total time for which application threads were stopped: 0.0824542 seconds, Stopping threads took: 0.0005238 seconds
```

我看到连续发生了两次 YGC，它们之间的间隔才 0.0001873s，可以认为是进行了一次很长时间的 GC，总耗时达到了 160ms。再仔细观察第二次 GC 时的内存分布，可以看到它作为一次 ParNew GC，发生时 eden 区的内存才使用了 200M，这就不符合常理了。

再看 GC 发生的原因，日志里标识的是 `GCLocker Initiated GC`。在使用 JNI 操作字符串或数组时，为了防止 GC 导致数组指针发生偏移，JVM 实现了 GCLocker，它会在发生 GC 的时候阻止程序进入临界区，并在最后一个临界区内的线程退出时，发生一次 GCLocker GC。

至于这次的 GC，是 JDK 的一个 Bug，[JDK-8048556](https://bugs.openjdk.java.net/browse/JDK-8048556) ，具体原因可以看这篇博客：[一次不必要的GCLocker-initiated young GC](https://www.jianshu.com/p/ecc57a81f73c)

而我们的 Java 版本低于修复版本，出现这种问题实属正常，可是，这个问题就归究于 jdk 的 bug 吗？升级了 jdk 版本就一定会好吗？

#### "平均"的陷阱
重新来计算一下，即使 JVM 每秒都有 160ms 在进行 GC，可系统有服务时间也还有 840ms，使用上文中的公式，信号量的还是完全足够的。 

一时想不明白，出去倒了杯水，走了走，忽然想到原来自己站错了角度。我一直用秒作为时间的基本单位，用一秒的平均状态来代表系统的整体状态，认为一整秒内如果没有问题，服务就不应该会发生问题，可是忽略了时间从来不是一秒一秒进行的。

试想，如果平稳运行的服务，忽然发生了一次 160ms 的 GC，那么这 160ms 内的请求会平均分配到剩余 840ms 内吗？并不会，它们会挤在第 161ms 一次发送过来，而我们设置的信号量限制会作出什么反应呢？

```java
    @Override
    public boolean tryAcquire() {
        int currentCount = count.incrementAndGet();
        if (currentCount > numberOfPermits.get()) {
            count.decrementAndGet();
            return false;
        } else {
            return true;
        }
    }
```
上面是 Hystrix 源码中获取信号量的代码，可以发现，代码里没有任何 block，如果当前使用的信号量大于配置值，就会直接拒绝。

这样就说得通了，如果进行了 160ms 的 GC，再加上请求处理的平均耗时是 15ms，那系统就有可能在瞬间堆积 `1000q/s * 0.175s = 175` 的请求，如果信号量不足，请求就会被直接拒绝了。

也就是说即使 jdk 的 bug 修复了，信号量限制最少还是要设置为 95 才不会拒绝请求。

## 限流配额的正确计算方式
---
#### 概念
那么限流配额的正确计算方式是怎样的呢？

在此之前我们要明确设置的限流配额都是`并发量`，它的单位是 `个`，这一点要`区分于我们常用的服务压力指标 QPS`，因为 QPS 是指一秒内的请求数，它的单位是 `个/S`，由于单位不同，它们是不能直接比较的，需要并发量再除以一个时间单位才可以。

正确的公式应当是  `并发量(个)/单个请求耗时(s) > QPS(个/s)`。

但由于 Java GC 的特性，我们不得不考虑 GC 期间请求堆积的可能，要处理这种情况，第一种是直接拒绝，像 Hystrix 的实现（有点坑），第二种是做一些缓冲。
#### 信号量缓冲
其实信号量并不是无法做缓冲的，只是 Hystrix 内的"信号量"是自己实现的，比较 low。

比较"正统"的方式是使用 jdk 里的 `java.util.concurrent.Semaphore`，它获取信号量有两种方式，第一种是 `tryAcquire()`，这类似于 Hystrix 的实现，是不会 block 的，如果当前信号量被占用或不足，会返回 false。第二种是使用 `acquire()` 方法，它没有返回值，意思是方法只有在拿到信号量时才会返回，而这个时间是不确定的。

我猜想这可能也是 Hystrix 不采用这种方式的原因，毕竟如果使用 FairSync 会有很多拿到信号量发现接口超时再抛弃的行为，而使用 UnFairSync 又会使接口的影响时长无法确定。

#### 线程池缓冲
线程池的缓冲比信号量要灵活得多，设置更大的 `maximumPoolSize` 或 `BlockingQueue` 都可以，设置 rejectHandler 也是很好的办法。

只是使用线程池会有上下文切换的损耗，而且应对突发流量时，线程池的扩容也比较拙技。

考虑到它的灵活性，以及可以通过 `Future.get()` 的超时时间来控制接口的最大响应时间，和信号量比，没有哪一种方式更好。

## 小结
---
解决了一个服务隐藏了很久的问题，又积累了排查此类问题的经验，得到了问题不能只从一个角度看待的教训，还是比较开心的。

当然，也又一次证明了看源码的重要性，遇到问题追一追源码，总会有些收益。

{{ site.article.summary }}