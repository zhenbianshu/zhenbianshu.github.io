---
layout: post
title: "应用调试工具-火焰图"
category: blog
tags: [Debug, tool, flamegraph]
date: 2019-04-13 08:00:06 +0800
comments: true
---

## 前言
---
工具的进化一直是人类生产力进步的标志，合理使用工具能大大提高我们的工作效率，遇到问题时，合理使用工具更能加快问题排查的进度。这也是我为什么非常喜欢 shell 的原因，它丰富的命令行工具集加管道特性处理起文本数据集来真的精准而优雅，让人迷醉。

但很多时候文本的表现力非常有限，可以说匮乏，表达绝对值时，自然是无往不利，但在展示相对值时，就有些捉襟见肘了，就更不用说多维数据了。我们用 shell 可以非常快速地查询出文本内的累加值、最大值等，但一遇到两组值的相关性分析时，就束手无策了。这个时候，就需要使用另一种分析工具 -- `图`了，如散点图就能很清晰地展示相关性。

今天就准备介绍一种图，`火焰图`，之前组内大神分享过它的使用办法，但我之后很久都没有用过，以至于对它没有什么深刻印象，最近排查我们 Java 应用负载问题时试用了一下，这才对它的用途有了点心得。

{{ site.article.copyright }}

## 介绍
---
#### 引子
在排查性能问题时，我们通常会把线程栈 dump 出来，然后使用 `grep --no-group-separator -A 1 java.lang.Thread.State jstack.log  | awk 'NR%2==0' | sort | uniq -c | sort -nr` 类似的 shell 语句，查看大多数线程栈都在干什么。而由线程栈的出现频率，来推断 JVM 内耗时最多的调用。

至于其原理，设想广场上有一个大屏幕在不停地播放各种广告。如果我们随机对大屏幕拍照，次数多了，统计照片中各个广告出现的频率，基本可以得出每个广告的播放时长占比了。而我们应用的资源就像大屏幕，每次调用就像是播放一次广告，统计 dump 出的线程栈出现比例，也就基本能看出线程栈的耗时占比，虽然有误差，但是多次统计下应该差不了多少。这也就是为什么有些家长每次进孩子房间都发现孩子在看系统桌面后以为孩子平时喜欢对着桌面发呆的原因。 :)

```shell
   2444 	at org.apache.catalina.loader.WebappClassLoaderBase.loadClass(WebappClassLoaderBase.java:1200)
   1587 	at sun.misc.Unsafe.park(Native Method)
    795 	at java.security.Provider.getService(Provider.java:1035)
    293 	at java.lang.Object.wait(Native Method)
    292 	at java.lang.Thread.sleep(Native Method)
     73 	at org.apache.logging.log4j.core.layout.TextEncoderHelper.copyDataToDestination(TextEncoderHelper.java:61)
     71 	at sun.nio.ch.EPollArrayWrapper.epollWait(Native Method)
     70 	at java.lang.Class.forName0(Native Method)
     54 	at org.apache.logging.log4j.core.appender.rolling.RollingFileManager.checkRollover(RollingFileManager.java:217)
```

但是这样有些问题，首先写 shell 挺费事的，另外如果我想查看自栈顶第二个栈的最多调用，即使修改了 shell 命令，结果也不直观。

产生这个问题的主要原因是，我们的线程栈是有调用关系的，即我们需要考虑线程栈的 `调用链` 和 `出现频率` 两个维度，而单一的文本表现这两种维度比较困难，所以，著名性能分析大师 brendan gregg 就提出了火焰图。

#### 介绍
火焰图，因其形似火焰而得名，其开源代码地址在 [Github-brendangregg-Flamegraph](https://github.com/brendangregg/FlameGraph)。

它是一种 svg 可交互式图形，我们通过点击和鼠标指向可以展示出更多的信息。下图就是一个典型的火焰图，从结构上，它是由多个大小和颜色各异的方块构成，每个方块上都有字符，它们底部连接在一块，组成火焰的基底，顶部分出许多"小火苗"。

<a href="http://www.brendangregg.com/FlameGraphs/cpu-bash-flamegraph.svg">
<img src="/images/2019/flamegraph_sample.svg" data-canonical-src="http://www.brendangregg.com/FlameGraphs/cpu-bash-flamegraph.svg">
</a>

当我们点击方块时，图片会从我们点击的方块为基底向上展开，而我们鼠标指向方块时，会展示出方块的详细说明。

#### 特性
介绍火焰图的分析前，我们要首先说明它的特性：

- 由底部到顶部可以追溯一个唯一的调用链，下面的方块是上面方块的父调用。
- 同一父调用的方块从左到右以字母序排列。
- 方块上的字符表示一个调用名称，括号内是火焰图指向的调用在火焰图中出现的次数和这个方块占最底层方块的宽度百分比。
- 方块的颜色没有实际意义，相邻方块的颜色差只为了便于查看。

#### 分析
那么，给我们一张火焰图，我们怎么能看出系统哪里有问题呢？

由上文中的火焰图特性特性，查看火焰图时，我们最主要的关注点要放在方块的宽度上，因为宽度代表了调用栈在全局出现的次数，次数代表着出现频率，而频率也就可以说明耗时。

但是观察火焰图底部或中部方块的宽度占比意义不大，如上面的火焰图，中部的 `do_redirections` 函数宽度是 24.87%，也就是说它耗用了整个应用近四分之一的时间，但是真正消耗时间的并不是 do_redirections 函数，而是 do_redirections 内部又调用的其他函数，而它的子调用分为了很多个，每个调用的耗时并没有异常。

我们更应该关注的是火焰图顶部的一些 "平顶山"，顶部说明它没有子调用，方块宽说明它耗时长，长时间 hang 住，或者被非常频率地调用，这种方块指向的调用才是性能问题的罪魁祸首。

找到了异常调用，直接优化它，或者再根据火焰图的调用链层层向下，找到我们的业务代码进行优化，也就大功告成。

#### 应用场景
每种工具都有其适合的应用场景，火焰图则适合用在：

- 代码循环分析：如果代码中有很大的循环或死循环代码，那么从火焰图的顶部或接近项部的地方会有很明显的"平顶"，表示代码频繁地在某个线程栈上下切换。但需要注意的是，如果循环的总耗时不长，在火焰图上不会很明显。
- IO 瓶颈/锁分析：在我们的应用代码中，我们的调用普遍都是同步的，也就是说在进行网络调用、文件 I/O 操作或未成功获得锁时，线程会停留在某个调用上等待 I/O 响应或锁，如果这个等待非常耗时，会导致线程在某个调用上一直 hang 住，这在火焰图上表现得会非常清晰。
    与此相对的是，我们应用线程构成的火焰图无法准确地表达 CPU 的消耗，因为应用线程内没有系统的调用栈，在应用线程栈 hang 住时，CPU 可能去做其他事了，导致我们看到耗时很长，而 CPU 却很闲。
- 火焰图倒置分析全局代码：火焰图倒置有时也会很实用，如果我们的代码 N 个不同的分支都调用某一方法，倒置后，所有栈顶相同的调用被合并在一块，我们就能看出这个方法的总耗时，也就很容易评估出优化这个方法的收益。

## 实现
---
既然火焰图这么强大，那么我们该怎么实现呢？

#### 生成工具
brendan gregg 大神已经把生成火焰图的方法用 perl 实现了，开源代码就在上文的 Github 仓库中，根目录下的 `flamegraph.pl` 文件就是可执行的 perl 文件了。

这个命令还可以传入各种参数，支持我们修改火焰图的颜色、大小等 。

但 flamegraph.pl 只能处理特定格式的文件，像：

```
a;b;c 12
a;d 3
b;c 3
z;d 5
a;c;e 3
```
前面是调用链，每个调用之间用 `;` 隔开，每行后面的数字是调用栈出现的次数。

如上面的数据，用 flamegraph.pl 生成的火焰图如下图：

<img src="/images/2019/flamegraph_test.png"/>

#### 数据准备
至于我们的 jstack 信息如何被处理成上面的格式，大神则为常见的 dump 格式都提供了工具，像 `stackcollapse-perf.pl` 可以处理 `perf` 命令的输出，`stackcollapse-jstack.pl` 处理 `jstack` 输出，`stackcollapse-gdb.pl` 处理 gdb 输出的栈等。

也可以用 shell 简单地实现一下 jstack 的处理方式：

`grep -v -P '.+prio=\d+ os_prio=\d+' | grep -v -E 'locked <' | awk '{if ($0==""){print $0}else{printf"%s;",$0}}' | sort | uniq -c | awk '{a=$1;$1="";print $0,a}'`

## 小结
---
火焰图总结完了，以后再遇到性能问题又多了一种应对方式。

做开发越久，越能感受得到工具的重要性，所以我准备加一个专题来专门介绍我使用的各种工具。当然，这也就更需要我更多地了解、使用和总结新的工具了。

{{ site.article.summary }}
