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
#### 奇怪的现象
之前的文章提到过我们服务使用 Hystrix 进行服务限流，使用的是信号量方式，并根据接口的响应时间和服务的峰值 QPS 设置了限流的配额。

限流配额的计算方式为：

我们接口单机单个接口的峰值 QPS 为 1000，平均影响时长 15ms，我们认为 Hystrix 的信号量是并发量，那么一个信号量在一秒内能允许 `1000ms/15ms~66` 个请求通过，那么服务 1000QPS 配置 15 个信号量就足够了。

当然这是在忽略上下文切换和 GC 时间的情况下，考虑上这些因素，每个并发量每秒能服务的时长约为 900ms，用同样的公式计算所需要的信号量是 17，为了应付突发流量，我将这个值设置为了 30。

本以为这样就高枕无忧了，没想到看错误日志中还是会偶然发现有报错：

```bash
HystrixRuntimeException occurred! , failureType:REJECTED_SEMAPHORE_EXECUTION, message:apiHystrixKey could not acquire a semaphore for execution and fallback failed.
```

我把信号量配置设置成了 40，没想到还是没看到问题有明显好转。

#### 排查步骤

{{ site.article.copyright }}

## 信号量限制
---
1. 看正常请求的平均耗时，排除真实 block 的可能。

warn log 内有拒绝，此时  access log内  59984ms 1493qps 应该有 150000ms 的有效时间



gc log：13:01:26

gc 时长 27+75+82ms=184ms

有效时间有 150000*0.816=122400



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

https://www.jianshu.com/p/ecc57a81f73c?utm_medium=hao.caibaojian.com&utm_source=hao.caibaojian.com

2020-03-17T13:01:26.438+0800: 89732.265: [GC (GCLocker Initiated GC) 2020-03-17T13:01:26.438+0800: 89732.265: [ParNew

Desired survivor size 429490176 bytes, new threshold 4 (max 4)

- age 1: 77800 bytes, 77800 total

- age 2: 107021848 bytes, 107099648 total

- age 3: 38341720 bytes, 145441368 total

- age 4: 6135784 bytes, 151577152 total

: 217683K->215658K(7549760K), 0.0548512 secs] 2596413K->2594388K(11744064K), 0.0561721 secs] [Times: user=0.49 sys=0.18, real=0.05 secs]

2020-03-17T13:01:26.495+0800: 89732.322: Total time for which application threads were stopped: 0.0824542 seconds, Stopping threads took: 0.0005238 seconds





2. 写一个小 case，压测看是否能复现

刚启动能复现，过一段时间就平稳



3. 排查 hystrix 代码

未发现不释放信号的状态



4. 压测一台机器，用 jmc 看可能 block



5. 忽然想通

gc 最大时长可认为 180ms，平均响应耗时是 40，最多一次堆积 220ms 的请求


tryAcquire 的坑

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



GC 问题

## 线程池大小
---

上下文切换

考虑 queue

考虑 rejectHandler

## 小结
---
原来可以控制平均响应时长的，现在不行了，但线程池又有性能损耗

{{ site.article.summary }}