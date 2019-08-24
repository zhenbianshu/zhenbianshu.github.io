---
layout: post
title: "SpringBoot 启动过程（上）与 Web 服务器合作"
category: blog
tags: [Spring, Tomcat]
date: 2019-07-27 11:00:06 +0800
comments: true
---

## 前言
---
最近对 Spring 越来越感兴趣，却在阅读它的源码时很容易被类之间的跳转和方法的嵌套绕晕，为了避免无尽的烦恼，我决定跟它做一个了断，不再追求细节，了解其启动过程和重要组件即可，之后遇到细节问题再看对应模块的源码。

我们都知道，一个 Java Web 服务进程，Web 服务器是其必不可少的组件之一，仅有 Spring 是无法受理系统的 HTTP 请求的。而且在 Java 的 Servlet 模型里，Spring 是作为 Web 服务器里的一个 Servlet 存在的，这就更能说明 Spring 和 Web 服务器的关系之亲密了。

但每个 Java 进程都只有一个主类，进程从其静态的 main 函数里启动，那么在 Spring 和 Web 服务器配合的场景中，Spring 和 Web 服务器之间是谁先启动的呢？Spring 容器和 Servlet 容器之间有包含关系吗？

要回答这两个问题，还需要分场景来看。

由于 Java Web 服务器里我们最熟悉 Tomcat，后面就以 Tomcat 来代表 Web 服务器了，而 Spring 相关我们都基于 SpringBoot 来说。

{{ site.article.copyright }}

## Jar 包方式
---
#### 实例
我们最常看到的是下面例子中的写法。

```java
@SpringBootApplication
public class ServerStarter {
    public static void main(String[] args) {
        SpringApplication.run(ServerStarter.class, args);
    }
}
```
这种方式非常符合我们对 Java 进程启动的认知。可以看到，我们在 ServerStarter.main 方法里直接使用了 `SpringApplication.run()` 方法，而 Spring 启动的流程都在 SpringApplication 类内，我们后续再详细分析。

在 IDE 里我们可以直接执行这个主类来启动 Spring 应用，而脱离了 IDE，我们就只能把整个应用打成一个 fat jar，并且在 jar 包的 MANIFEST 文件内设置 Main-Class 属性值为 package.path.ServerStarter 来声明主类。这样，在使用 `java -jar spring_starter.jar` 时， JVM 就知道该从哪个类开始加载。

#### 联系
Spring 容器是启动成功后， Tomcat Web 服务器的启动就要靠 Spring 了，我查看了 SpringApplication 类的代码整理出以下流程。

1. 创建 SpringApplication 时使用在 `deduceWebApplicationType()` 通过一些标志类(如 org.springframework.web.servlet.DispatcherServlet) 是否存在，推断是出应用类型，一般是 `WebApplicationType.SERVLET`。
2. 创建 `createApplicationContext()` 方法内，根据应用类型创建出一个 `AnnotationConfigServletWebServerApplicationContext` 类型的 ConfigurableApplicationContext。
3. 由于 AnnotationConfigServletWebServerApplicationContext 类是 ServletWebServerApplicationContext 的子类，在 `ApplicationContext.refresh()` 时，会通过 `ServletWebServerApplicationContext.onRefresh()` 方法创建一个 webServer。
4. DispatcherServlet 通过 `ServletContextInitializer -> ServletRegistrationBean<DispatcherServlet>` 注册到 Tomcat 容器内，完成两者的关联。

## War 包方式
---
#### 实例
在生产环境部署服务时，我们更多地使用 war 包的方式，因为它可以很方便地支持 jsp，而通过 jsp 我们可以给生产环境调试添加一定的灵活性。在使用 docker 部署时，也能将 Tomcat 和服务分层，便于镜像的维护。

我们知道，一个 war 包是没有自运行能力的，必须要先启动一个 Tomcat 进程，由 Tomcat 自动解压并加载 webapps 目录下的 war 包来启动服务，所以通过 war 包启动的 Spring Web 主类一定是 Tomcat 类。

在主类已存在的情况下，我们的 Spring 入口类就不再需要 main 方法了，常见写法如下：

```java
@SpringBootApplication
public class ServerStarter extends SpringBootServletInitializer {
    @Override
    protected SpringApplicationBuilder configure(SpringApplicationBuilder application) {
        return application.sources(ServerStarter.class);
    }
}
```
可以看到，Spring 入口类继承了 `SpringBootServletInitializer` 类，最上层的接口是 `org.springframework.web;.WebApplicationInitializer`。

#### 联系
查看 Tomcat 的 web.xml 配置，没有一丝 spring 的痕迹，要知道 Tomcat 是如何联系上 Spring 的，还要从 WebApplicationInitializer 接口开始。

这种实现方式需要两种新特性的支持：

- Java 1.6 之后新添加了一个类 `java.util.ServiceLoader`，提供了一种新的有别于 ClassLoader 的类发现机制。当我们在 `META-INF/services` 文件夹内添加文件，文件名是全路径的接口，文件内容每一行是全路径的接口实现，就可以通过 `ServiceLoader.load(Class interface)` 方法加载到对应的接口实现，这种机制就是 `SPI` (Service Provider Interface)，使用这种机制，加载用户实现的特定接口时就不需要类加载器扫描所有的类文件了。不过如果要加载的接口是 Java 底层类时，类加载器会是 BootstrapClassLoader 或 ExtClassLoader，加载子类时需要指定使用 classLoader 为 currentThreadClassLoader (一般是加载应用的 AppClassLoader)。
- Servlet 3.0+ 提供了另一种替代 web.xml 的 Servlet 配置机制 `ServletContainerInitializer` 接口，Tomcat 会在 Servlet 容器创建后调用 ServletContainerInitializer.onStartup() 方法，便于我们向容器内注册一些 Servlet 对象。

我一路跟随文档向上查看，总结了一下整个流程。

1. Spring 在 web 包的 META-INF/services 内添加了文件 javax.servlet.ServletContainerInitializer，内容为 org.springframework.web.SpringServletContainerInitializer。
2. Tomcat 容器启动后，通过 ServiceLoader 加载到 SpringServletContainerInitializer 实例。
3. SpringServletContainerInitializer 通过 `@HandlesTypes` 注解获取到 `WebApplicationInitializer` 接口的所有实现（包括 SpringBootServletInitializer、AbstractDispatcherServletInitializer 等）。
4. 在 `SpringBootServletInitializer.onStartup()` 方法内初始化了 Spring 容器。
5. 在 `AbstractDispatcherServletInitializer.registerDispatcherServlet()` 方法内实现了 DispatcherServlet 与 Tomcat 的关联。

## 小结
---
看完了两种服务打包方式下 Spring 容器被加载的过程，文章开头的两个问题应该就有迹可循了。

首先 Spring 和 Web 服务器的启动先后会根据服务打包方式有所不同，使用 jar 包时是 Spring 先启动，而使用 war 包时是 Web 服务器先启动。

而 Spring 容器与 Servlet 容器的包含关系，我理解是并不存在的，A 启动了 B，所以 A 包含 B 的理论由上文也可以看出是站不住脚的。Servlet 容器和 Spring 之间只是存储的元素不同，Servlet 容器内存放着 Servlet 实例，而 Spring 中存放着各种环境变量、Bean 对象等。而它们之前的联系就是 DispatcherServlet，它既是一个 Servlet 实例，又是一个 Bean，通过 DispatcherServlet，Tomcat 可以调用到 Spring 容器内部的对象，从线程栈上来看是 Web 服务器在下，Spring 更往上。

{{ site.article.summary }}
