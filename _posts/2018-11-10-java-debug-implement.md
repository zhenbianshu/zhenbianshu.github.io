---
layout: post
title: "Java Debug 时的 Evaluate 是怎么实现的"
category: blog
tags: [java, asm, byte code, debug, JVM TI]
date: 2018-11-10 13:00:06 +0800
comments: true
---

## 对 Debug 的好奇
---

初学 Java 时，我对 IDEA 的 Debug 非常好奇，不止是它能查看断点的上下文环境，更神奇的是我可以在断点处使用它的 Evaluate 功能直接执行某些命令，进行一些计算或改变当前变量。

刚开始语法不熟经常写错代码，重新打包部署一次代码耗时很长，我就直接面向 Debug 开发。在要编写的方法开始处打一个断点，在 Evaluate 框内一次次地执行方法函数不停地调整代码，没问题后再将代码复制出来放到 IDEA 里，再进行下一个方法的编写，这样就跟写 PHP 类似的解释性语言一样，写完即执行，非常方便。

<img src="/images/2018/IDEA_evaluate.png" />

随着对 Java 的愈加熟悉，我也了解了反射、字节码等技术，直到前些天的周会分享，有位同事分享了 Btrace 的使用和实现，提到了 Java 的 ASM 框架和 JVM TI，而 Debug 和实现和 Btrace 是类似的，于是我有了和它的第一次接触。

分享就像一个引子，从中学到的东西只是皮毛，要了解它还是要自己研究。于是自己查看资料并写代码学习了下其具体实现。

{{ site.article.copyright }}

## ASM
---
实现 Evaluate 要解决的第一个问题就是怎么改变原有代码的行为，它的实现在 Java 里被称为动态字节码技术。

#### 动态生成字节码
我们知道，我们编写的 Java 代码都是要被编译成字节码后才能放到 JVM 里执行的，而字节码一旦被加载到虚拟机中，

字节码文件（.class）就是普通的二进制文件，它是通过 Java 编译器生成的。而只要是文件就可以被改变，如果我们用特定的规则解析了原有的字节码文件，对它进行修改或者干脆重新定义，这不就可以改变代码行为了么。

####

输出修改后的字节码

#### 常用方法

## Instrument
---


## JVM TI
---

多个 JVMTIAgent 构成， 有 instrument(本地), jdwp(远程)

#### 介绍

#### 远程实现


## 代码实现
---
#### 修改代码

#### 连接改变


## 小结
---


参考：

[教你用Java字节码做点有趣的事](https://juejin.im/post/5b549bcbe51d45169c1c8b66?utm_source=gold_browser_extension)


[Java Instrument原理](https://juejin.im/post/5ad5ac7351882555784e7667)