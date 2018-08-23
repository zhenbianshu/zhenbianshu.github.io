---
layout: post
title: "轻量级应用 Spring 特性"
date: 2018-08-23 16:00:06 +0800
comments: true
---

## 前言
---
最近在了解 Java 效率测试库 jmh 时，遇到一个问题，我想在 jmh 里使用项目里的某个 Spring Bean，但我是在本地单独运行的 jmh，而这个 bean 创建却需要依赖很多我们项目里的配置，这就出现了一个非常尴尬的局面，如果在项目使用 jmh，每次测试同步到测试机，稍稍改动一下就要重启一两分钟；而如果我自己创建一个对象的话又要自己手动配置很多项目里的依赖。

而且，之前一次调试中，我在 debug 环境想查看一下此时 beanFactory 里是否有否个 bean，却因为获取不到 beanFactory 失败，这使得我对 Spring 核心的理解需求更迫切了。

Spring 是个挺重的框架了，配置和启动它都很耗时，想在外部使用 Spring 特性时，要配置一个单独的系统非常复杂，所以我想是否能在外部普通类中使用 Spring 的特性。

{{ site.article.copyright }}

## Spring 结构
---
Spring 是个很庞大的系统，为开发者提供了很多附加功能，但我们要使用 Spring 的特性，并不一定需要加载所有功能，只需要加载 Spring 的"核心"功能就行了。

#### Spring 核心
要想找到 Spring 的核心，并找到核心为我们提供的接口，就必须了解 Spring 的整体结构。

如下核心结构图：

<img src="/images/2018/spring-structure.png">

spring 分为核心层和应用层两大块。

应用层为我们提供很多常用的特性，如 AOP 提供面向切面编程的能力，JDBC 实现与数据库的交互，Web模块 提供了 web 开发中常用的参数解析等功能。

而核心层包括 core、bean、context 三大模块，为应用层的特性提供支持。

- core 模块提供资源获取、环境配置等功能；
- 由于 Spring 是面向 bean 编程，所以 bean 模块是当之无愧的重中之重，它为 Spring 运行必不可少的 bean 提供服务，包括 bean 的解析、依赖解析。
- context 提供 Spring 的上下文环境，它为服务提供环境对外的接口，bean 虽然重要，但我们的目标是 context。

查看 Spring 项目的启动代码，我们会发现 一个 Spring 应用内的源码最终都会调用 `context.refresh()` 来创建一个 ApplicationContext 向外层提供服务。所以我们认为 ApplicationContext 是整个核心模块整合起来对外提供的一个统一的接口。

## ApplicationContext
---
### 功能

我们看 ApplicationContext 的接口结构，它 实现了 `EnvironmentCapable, ListableBeanFactory, HierarchicalBeanFactory,MessageSource, ApplicationEventPublisher, ResourcePatternResolver` 等接口，文档上对这些有大略的介绍，通过子类对这些接口的实现，一个 ApplicationContext 会具有以下功能：

- 首先它继承了 ListableBeanFactory 接口，我们可以通过它获取到 beanFactory 内的 bean；
- 由 ResourceLoader ，ApplicationContext 具有通用的加载资源的能力；
- 由 EventPublisher，它有向已注册的事件监听器发布事件的功能；
- 由 MessageSource，它有解析消息的功能；

### 创建 ApplicationContext
既然知道了 ApplicationContext 就是我们要找的核心接口，那么如何才能实例化一个 ApplicationContext 呢？

#### spring 项目中
ApplicationContext 作为 spring 的核心，spring 内部自然提供了一些方法可以获取到它。

- 使用 spring 的 `@Autowired` 注解让 spring 自动将它注入到类属性里。
- 我们可以让某个 bean 实现 `ApplicationContextAware` 自动注入 ApplicationContext 的引用。

    spring 的 aware 接口能让 bean 能感知到 spring 容器的信息，实现 ApplicationContextAware 的 `setApplicationContext(ApplicationContext ApplicationContext)` 方法后，bean 在创建后，spring 会自动调用此方法向 bean 通知容器信息。
- 在 spring web 应用中，spring 提供了 webApplicationContextUtil 可以获取。

    在 web 应用中，每个 servlet 都有会 servletContext 作为此 servlet 的上下文环境，而 spring 在创建 webApplicationContext 后，会将它存储到 servletContext 的属性(Attribute)内，所以我们可以通过 `(WebApplicationContext) servletContext.getAttribute(WebApplicationContext.ROOT_WEB_APPLICATION_CONTEXT_ATTRIBUTE);` 获取到。

    除此之外，我们还可以通过 `WebApplicationContextUtils.getWebApplicationContext(servletContext) ` 获取，而获取到当前 web 应用的 servletContext 也非常简单，每个 servletRequest 中都有它的引用 `ServletContext context = ((ServletRequestAttributes)RequestContextHolder.getRequestAttributes()).getRequest().getServletContext();`。通过这种方法，我们可以在 debug 自己的 web 项目时获取 ApplicationContext 进而查看已注册的bean和各种环境参数。

#### 外部系统中
而在外部系统中，我们就需要自己实例化一个 ApplicationContext 对象，spring 会根据我们实例化的参数初始化 core，提供出核心接口：

我们可以从 xml 文件加载 ApplicationContext，我们只需要提供项目使用的 xml 文件，即可初始化我们所需要的 ApplicationContext。从 xml 文件加载也有两种方式，` ClassPathXmlApplicationContext` 和 `FileSystemXmlApplicationContext`，前者从 应用classpath 下寻找 xml 文件，而后者从文件系统内寻找。

需要注意，FileSystemXmlApplicationContext 会默认以当前虚拟机路径为相对路径，如果需要使用系统的绝对路径，可以在路径前加入 `file:` 前缀。

## 小结
---
那么，说了这么多花里糊哨的操作，我们加载 Spring 有什么作用呢？

首先，它能解决我文章开头的问题，我可以使用 xml 方式初始化一个 ApplicationContext，然后使用它的 `getBeanByName()` 方法获取到我需要的 bean, 在 jmh 里使用 Spring 的 bean。

我也可以在遇到 spring 的框架问题时，使用 ApplicationContext 的 `getBeanDefinitionNames` 方法获取到所有已加载的 bean，并查看 bean 加载问题。

当然，加载完 Spring 的核心模块后，我们可以用来调试 Spring 框架的应用层功能，如前文说过的 AOP、JDBC 等。

{{ site.article.summary }}