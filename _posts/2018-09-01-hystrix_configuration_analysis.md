---
layout: post
title: "Hystrix 配置参数全解析"
date: 2018-09-01 12:00:06 +0800
comments: true
---

## 前言
---
不久前在部门周会上分享了 Hystrix 源码解析之后，就无奈地背上了"专家包袱"，同事们都认为我对 Hystrix 很熟，我们接触 Hystrix 更多的还是工作中的使用和配置，所以很多人一遇到 Hystrix 的配置问题就会过来问我。为了不让他们失望，我把 Hystrix 的[配置文档](https://github.com/Netflix/Hystrix/wiki/Configuration) 仔细看了一遍，将有疑问的点通过翻源码、查官方 issue、自己实验的方式整理了一遍，这才对 Hystrix 的配置有了一定的了解。

在了解这些配置项的过程中，我也发现了很多坑，平常我们使用中认为理所应当的值并不会让 Hystrix 如期望工作，没有经过斟酌就复制粘贴的配置会让 Hystrix 永远不会起作用。于是写下本文，希望能帮助小伙伴们掌握 Hystrix。如果想了解 Hystrix 的话，可以搭配我之前的分享 PPT：[Hystrix 源码解析]({{ site.baseurl }}/2018/08/hystrix_code_design_share.html)

{{site.article.copyright}}

## HystrixCommand
---
#### 配置方式
我们的配置都是基于 HystrixCommand 的，我们通过在方法上添加 `@HystrixCommand` 注解并配置注解的参数来实现配置，但有的时候一个类里面会有多个 Hystrix 方法，每个方法都是类似配置的话会冗余很多代码，这时候我们可以在类上使用 `@DefaultProperties` 注解来给整个类的 Hystrix 方法设置一个默认值。

#### 配置项
下面是 HystrixCommand 支持的参数，除了 `commandKey/observableExecutionMode/fallbackMethod` 外，都可以使用 `@DefaultProperties` 配置默认值。

- **commandKey**：用来标识一个 Hystrix 命令，默认会取被注解的方法名。需要注意：`Hystrix 里同一个键的唯一标识并不包括 groupKey`，建议取一个独一二无的名字，防止多个方法之间因为键重复而互相影响。

- **groupKey**：一组 Hystrix 命令的集合， 用来统计、报告，默认取类名，可不配置。

- **threadPoolKey**：用来标识一个线程池，`如果没设置的话会取 groupKey`，很多情况下都是同一个类内的方法在共用同一个线程池，如果两个共用同一线程池的方法上配置了同样的属性，在第一个方法被执行后线程池的属性就固定了，所以属性会以第一个被执行的方法上的配置为准。

- **commandProperties**：与此命令相关的属性。

- **threadPoolProperties**：与线程池相关的属性，

- **observableExecutionMode**：当 Hystrix 命令被包装成 RxJava 的 Observer 异步执行时，此配置指定了 Observable 被执行的模式，默认是 `ObservableExecutionMode.EAGER`，Observable 会在被创建后立刻执行，而 `ObservableExecutionMode.EAGER`模式下，则会产生一个 Observable 被 subscribe 后执行。我们常见的命令都是同步执行的，此配置项可以不配置。

- **ignoreExceptions**：默认 Hystrix 在执行方法时捕获到异常时执行回退，并统计失败率以修改熔断器的状态，而被忽略的异常则会直接抛到外层，不会执行回退方法，也不会影响熔断器的状态。

- **raiseHystrixExceptions**：当配置项包括 `HystrixRuntimeException` 时，所有的未被忽略的异常都会被包装成 HystrixRuntimeException，配置其他种类的异常好像并没有什么影响。

- **fallbackMethod**：方法执行时熔断、错误、超时时会执行的回退方法，需要保持此方法与 Hystrix 方法的签名和返回值一致。

- **defaultFallback**：默认回退方法，当配置 fallbackMethod 项时此项没有意义，另外，默认回退方法不能有参数，返回值要与 Hystrix方法的返回值相同。

## commandProperties
---
#### 配置方式
Hystrix 的命令属性是由 `@HystrixProperty` 注解数组构成的，HystrixProperty 由 name 和 value 两个属性，数据类型都是字符串。

以下将所有的命令属性分组来介绍。
#### 线程隔离(Isolation)
- **execution.isolation.strategy**： 配置请求隔离的方式，有 threadPool（线程池，默认）和 semaphore（信号量）两种，信号量方式高效但配置不灵活，我们一般采用 Java 里常用的线程池方式。

- **execution.timeout.enabled**：是否给方法执行设置超时，默认为 true。

- **execution.isolation.thread.timeoutInMilliseconds**：方法执行超时时间，默认值是 1000，即 1秒，此值根据业务场景配置。

- **execution.isolation.thread.interruptOnTimeout**：
**execution.isolation.thread.interruptOnCancel**：是否在方法执行超时/被取消时中断方法。需要注意在 JVM 中我们无法强制中断一个线程，如果 Hystrix 方法里没有处理中断信号的逻辑，那么中断会被忽略。

- **execution.isolation.semaphore.maxConcurrentRequests**：默认值是 10，此配置项要在 `execution.isolation.strategy` 配置为 `semaphore` 时才会生效，它指定了一个 Hystrix 方法使用信号量隔离时的最大并发数，超过此并发数的请求会被拒绝。信号量隔离的配置就这么一个，也是前文说信号量隔离配置不灵活的原因。


#### 统计器(Metrics)
**`滑动窗口`**：
Hystrix 的统计器是由滑动窗口来实现的，我们可以这么来理解滑动窗口：一位乘客坐在正在行驶的列车的靠窗座位上，列车行驶的公路两侧种着一排挺拔的白杨树，随着列车的前进，路边的白杨树迅速从窗口滑过，我们用每棵树来代表一个请求，用列车的行驶代表时间的流逝，那么，列车上的这个窗口就是一个典型的滑动窗口，这个乘客能通过窗口看到的白杨树就是 Hystrix 要统计的数据。

**`桶`**：
bucket 是 Hystrix 统计滑动窗口数据时的最小单位。同样类比列车窗口，在列车速度非常快时，如果每掠过一棵树就统计一次窗口内树的数据，显然开销非常大，如果乘客将窗口分成十分，列车前进行时每掠过窗口的十分之一就统计一次数据，开销就完全可以接受了。 Hystrix 的 bucket （桶）也就是窗口 N分之一 的概念。

- **metrics.rollingStats.timeInMilliseconds**：此配置项指定了窗口的大小，单位是 ms，默认值是 1000，即一个滑动窗口默认统计的是 1s 内的请求数据。

- **metrics.healthSnapshot.intervalInMilliseconds**：它指定了健康数据统计器（影响 Hystrix 熔断）中每个桶的大小，默认是 500ms，在进行统计时，Hystrix 通过 `metrics.rollingStats.timeInMilliseconds / metrics.healthSnapshot.intervalInMilliseconds` 计算出桶数，在窗口滑动时，每滑过一个桶的时间间隔时就统计一次当前窗口内请求的失败率。

- **metrics.rollingStats.numBuckets**：Hystrix 会将命令执行的结果类型都统计汇总到一块，给上层应用使用或生成统计图表，此配置项即指定了，生成统计数据流时滑动窗口应该拆分的桶数。此配置项最易跟上面的 `metrics.healthSnapshot.intervalInMilliseconds` 搞混，认为此项影响健康数据流的桶数。 此项默认是 10，并且需要保持此值能被 `metrics.rollingStats.timeInMilliseconds` 整除。

- **metrics.rollingPercentile.enabled**：是否统计方法响应时间百分比，默认为 true 时，Hystrix 会统计方法执行的 `1%,10%,50%,90%,99%` 等比例请求的平均耗时用以生成统计图表。

- **metrics.rollingPercentile.timeInMilliseconds**：统计响应时间百分比时的窗口大小，默认为 60000，即一分钟。

- **metrics.rollingPercentile.numBuckets**：统计响应时间百分比时滑动窗口要划分的桶用，默认为6，需要保持能被`metrics.rollingPercentile.timeInMilliseconds` 整除。

- **metrics.rollingPercentile.bucketSize**：统计响应时间百分比时，每个滑动窗口的桶内要保留的请求数，桶内的请求超出这个值后，会覆盖最前面保存的数据。默认值为 100，在统计响应百分比配置全为默认的情况下，每个桶的时间长度为 10s = 60000ms / 6，但这 10s 内只保留最近的 100 条请求的数据。

#### 熔断器(Circuit Breaker)
- **circuitBreaker.enabled**：是否启用熔断器，默认为 true;

- **circuitBreaker.forceOpen**：
**circuitBreaker.forceClosed**：是否强制启用/关闭熔断器，强制启用关闭都想不到什么应用的场景，保持默认值，不配置即可。

- **circuitBreaker.requestVolumeThreshold**：启用熔断器功能窗口时间内的最小请求数。试想如果没有这么一个限制，我们配置了 50% 的请求失败会打开熔断器，窗口时间内只有 3 条请求，恰巧两条都失败了，那么熔断器就被打开了，5s 内的请求都被快速失败。此配置项的值需要根据接口的 QPS 进行计算，值太小会有误打开熔断器的可能，值太大超出了时间窗口内的总请求数，则熔断永远也不会被触发。建议设置为 `QPS * 窗口秒数 * 60%`。

- **circuitBreaker.errorThresholdPercentage**：在通过滑动窗口获取到当前时间段内 Hystrix 方法执行的失败率后，就需要根据此配置来判断是否要将熔断器打开了。 此配置项默认值是 50，即窗口时间内超过 50% 的请求失败后会打开熔断器将后续请求快速失败。

- **circuitBreaker.sleepWindowInMilliseconds**：熔断器打开后，所有的请求都会快速失败，但何时服务恢复正常就是下一个要面对的问题。熔断器打开时，Hystrix 会在经过一段时间后就放行一条请求，如果这条请求执行成功了，说明此时服务很可能已经恢复了正常，那么会将熔断器关闭，如果此请求执行失败，则认为服务依然不可用，熔断器继续保持打开状态。此配置项指定了熔断器打开后经过多长时间允许一次请求尝试执行，默认值是 5000。

#### 其他(Context/Fallback)
- **requestCache.enabled**：是否启用请求结果缓存。默认是 true，但它并不意味着我们的每个请求都会被缓存。缓存请求结果和从缓存中获取结果都需要我们配置 `cacheKey`，并且在方法上使用 `@CacheResult` 注解声明一个缓存上下文。

- **requestLog.enabled**：是否启用请求日志，默认为 true。

- **fallback.enabled**：是否启用方法回退，默认为 true 即可。

- **fallback.isolation.semaphore.maxConcurrentRequests**：回退方法执行时的最大并发数，默认是10，如果大量请求的回退方法被执行时，超出此并发数的请求会抛出 `REJECTED_SEMAPHORE_FALLBACK` 异常。


## threadPoolProperties
---
#### 配置方式
线程池的配置也是由 HystrixProperty 数组构成，配置方式与命令属性一致。

#### 配置项
- **coreSize**：核心线程池的大小，默认值是 10，一般根据 `QPS * 99% cost + redundancy count` 计算得出。

- **allowMaximumSizeToDivergeFromCoreSize**：是否允许线程池扩展到最大线程池数量，默认为 false;

- **maximumSize**：线程池中线程的最大数量，默认值是 10，此配置项单独配置时并不会生效，需要启用 `allowMaximumSizeToDivergeFromCoreSize` 项。

- **maxQueueSize**：作业队列的最大值，默认值为 -1，设置为此值时，队列会使用 `SynchronousQueue`，此时其 size 为0，Hystrix 不会向队列内存放作业。如果此值设置为一个正的 int 型，队列会使用一个固定 size 的 `LinkedBlockingQueue`，此时在核心线程池内的线程都在忙碌时，会将作业暂时存放在此队列内，但超出此队列的请求依然会被拒绝。

- **queueSizeRejectionThreshold**：由于 `maxQueueSize` 值在线程池被创建后就固定了大小，如果需要动态修改队列长度的话可以设置此值，即使队列未满，队列内作业达到此值时同样会拒绝请求。此值默认是 5，所以有时候只设置了 `maxQueueSize` 也不会起作用。

- **keepAliveTimeMinutes**：由上面的 `maximumSize`，我们知道，线程池内核心线程数目都在忙碌，再有新的请求到达时，线程池容量可以被扩充为到最大数量，等到线程池空闲后，多于核心数量的线程还会被回收，此值指定了线程被回收前的存活时间，默认为 2，即两分钟。

#### 工作方式
Hystrix 内线程池的使用是基于 Java 内置线程池的简单包装，通常有以下三种状态：

- 如果请求量少，达不到 coreSize，通常会使用核心线程来执行任务。
- 如果设置了 `maxQueueSize`，当请求数超过了 coreSize, 通常会把请求放到 queue 里，待核心线程有空闲时消费。
- 如果 queue 长度无法存储请求，则会创建新线程执行直到达到 `maximumSize` 最大线程数，多出核心线程数的线程会在空闲时回收。

## 小结
---
排查配置问题本身也是学习的过程，了解 Hystrix 源码的过程中也学到了不少 Java 线程池相关的知识，嗯，收获不小。

{{site.article.summary}}