---
layout: post
title: "写一个类 Spring MVC 框架（一）：结构"
category: blog
tags: [Spring, MVC, framework, Java]
date: 2019-02-23 08:00:06 +0800
comments: true
---

## 想法
---
#### 框架
近些年来，Spring 家族套装一直作为 Java 工程师的必备技能存在，它深深契合程序员的所思所想，提供了很多方便开发的特性，大大加快了我们的开发进度。

Spring 通过层层封装提供各种方便特性的时候，也将底层变得"透明"。虽然完全支持用框架提升开发速度，但也不禁忧虑，只会在框架上对业务代码修修补补，做一些增删改查逻辑的我们，离了框架，还能写出 "Hello World" 吗？

所以我认为，在学习 Spring 框架使用的同时，了解其实现也是很重要的事情。

#### 仿写
了解实现无非是阅读其源码，但源码是枯燥乏味的，在 Debug 时几十层的栈就让不少人望而却步了，又加上很难在短时间内产生成就感成为我们继续下去的动力，所以读源码时开始不久就放弃是再正常不过的事了，就更不用说读 Spring 这种大型项目的源码一。

我学习框架的方式是仿写：

- 仿写前我们会把整个框架拆成多个功能点，每个功能点分别进行，分而克之。
- 仿写时不仅能锻炼自己的代码能力，也能检验自己对功能点的理解。
- 仿写完成后的成就感更能促进自己更有动力进行下去。

所以，从这篇开始我会断断续续记录自己仿写 Spring 的过程，在分享的同时，也加深自己的理解。

## 技术栈
---
开始之前先列一下项目的目标和所用的技术栈，当然也会在过程中进行微调。

- 使用 gradle 管理包依赖。
- 集成 Tomcat，支持 jar 包方式部署。
- 类似于 spring-boot 的配置启动方式
- 实现通过包扫描进行类的解析和 Bean 依赖注入。
- 实现类 Spring 的 Bean 管理方式。
- 实现通过注解进行 Bean 配置。
- MVC 并将响应结果序列化为 json。

## Gradle
---
#### 包依赖管理工具
项目是的包依赖管理工具是必不可少的了，项目大了，各种依赖交叉重叠，经常会出现包冲突，包依赖管理工具帮我们整理各个包之间的依赖工具，帮我们自动下载对应版本的依赖包，并在我们将项目打包中自动将这些依赖包打包进去。

我们最常用的包依赖管理工具应该是 `maven` 了，它使用的 pom 配置文件本质上是 `xml`，配置时需要完善各种 xml 标签，而 xml 对格式要求比较严格，需要随时注意标签的闭合。添加一个包依赖往往要增加四五行 xml 代码，一个项目的 pom 文件上千行再正常不过了，而且 xml 的层级展示全靠缩进，同一层级内配置了五六个包依赖就占用了一屏，想看上层是什么得往上翻好久。

#### 简单使用
相对于 xml 的繁杂，我更喜欢 json 的简洁。而 gradle 就使用 json 格式的配置文件，而且它将每个依赖都浓缩到一行，分别用 group、name、version 表示包的组、项目名和版本号，分别类同于 maven 里的 groupId、artifactId 和 version。

更方便的是在 gradle 配置文件里，我们可以自定义函数来实现我们需要的功能，虽然提升了学习曲线的坡度，但也大大增加了 gradle 配置的灵活性。

gradle 的配置文件放在项目和模块的根目录，后缀是 `.gradle`， 项目根目录下的配置可以影响各个子模块，我们也可以在各个子模块里进行个性化的配置。

#### 实例
下面是个简单的配置实例，我在注释里为每项配置添加说明。

项目整合配置
```bash
group 'winter'

// 为各个子模块添加统一配置
subprojects {
    apply plugin: 'java'
    apply plugin: 'idea'

    // 添加仓库地址
    repositories {
        maven { url 'http://maven.aliyun.com/nexus/content/groups/public/' }
        mavenCentral()
    }

    // 声明 Java 版本
    sourceCompatibility = 1.8
    targetCompatibility = 1.8

    // 模块内可以配置模块内的统一依赖
    dependencies{
        compile group: 'org.apache.commons', name: 'commons-lang3', version: '3.4'
        compile group: 'commons-collections', name: 'commons-collections', version: '3.2.1'
    }
}
```

模块配置

```bash
version 1.2 // 声明模块版本

// 子模块个性化配置
dependencies {
    // 声明对同级模块的依赖
    compile(project(':winter-framework'))
}

// 完善 jar 模块来声明打包的具体工作
jar {
    // 配置 manifest 文件
    manifest {
        attributes "Main-Class": "zhenbianshu.github.com.MyApplication"
    }
    // 声明一个函数在打包时将依赖项都打包进去
    from {
        configurations.compile.collect { it.isDirectory() ? it : zipTree(it) }
    }
}

```

#### manifest 文件

## 结构
---
将 spring 的每个大模块放到一个包里实现，顺便看一下 spring 的整体代码结构


## 小结
---
造轮子，没人用

更好的使用，便于查问题

便于阅读源码

利于修改和扩展 harmonia