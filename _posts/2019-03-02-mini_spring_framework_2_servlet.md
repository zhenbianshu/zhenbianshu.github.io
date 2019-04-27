---
layout: post
title: "Mini Spring-Boot（二）Servlet 容器"
category: blog
tags: [Spring, framework, Java]
date: 2019-03-02 08:00:06 +0800
comments: true
hidden: true
---

## 续言
---
上篇文章中我们把框架的功能和结构都预定好了，从本篇开始逐步添加功能点，使它迅速丰满起来。

实现过程呢，就顺从敏捷开发思想的引导，首先使框架能 Run 起来，再通过快速迭代、小步快跑地优化。框架是没法独立运行起来的，还需要搭配上工程实现业务逻辑才行。所以，我们向项目内添加一个同级模块使用 winter 框架，这也算是 TDD 测试驱动开发的另一种表现形式了。

当然了，开始阶段只有一个入口类，项目也只依赖框架，一个普通 Main 入口类即可。

项目地址：[winter-zhenbianshu-Github](https://github.com/zhenbianshu/winter-framework)

{{ site.article.copyright }}

## Servlet 和容器
---
#### Server
我们知道，一个 HTTP 请求被发送到服务器时，都是二进制的字节流，是操作系统的 TCP/IP 栈把这些字节流解析成带有 IP 和端口的 TCP 字节流请求，然后将字节流分配给对应的进程来处理。能够受理外部请求的进程我们暂时把它称作 socket 服务进程，每个服务进程都监听着一个服务器端口，操作系统就是根据这个端口来对应每个外部请求和服务进程的。

由上，由于服务器会监听系统的端口，受理操作系统字节流请求的应该是服务器，而职责单一的服务器是不应该跟业务耦合的，具体的业务逻辑还是应该由服务器交给我们的 Java 应用程序来处理。

#### 规范

那么从操作系统接收到的字节流请求应该怎么给 Java 程序，Java 程序又应该怎么响应回来呢？如果每种服务器或每种 Java 程序都自己定义自己的结构，那服务器与 Java 程序的适配将成为一个大问题。这时候就需要一种规范。

于是 Java 就制定了一种标准，在 Java 语言内实现为接口，叫 `Servlet`，它的包全路径为 `javax.servlet.Servlet`。

它有五个预定义的方法：

```java
public interface Servlet {
    // servlet 初始化方法
    public void init(ServletConfig config) throws ServletException;

    // 获取 servlet 配置
    public ServletConfig getServletConfig();

    // servlet 响应请求方法
    public void service(ServletRequest req, ServletResponse res)
            throws ServletException, IOException;

    // 获取 servlet 信息（版本、版权等）方法
    public String getServletInfo();

    // servlet 销毁方法
    public void destroy();
}
```
如果一个 Java 程序都实现这个接口，那么这个 Java 程序我们称为一个 `servlet`。而服务器保存着多个 servlet 的实例，所以 Java 服务器也被称为 `servlet 容器`。

#### 流程
每个服务器会保留接口保存 servlet 和它们要处理业务逻辑（通常是 `host + uri`）的映射，将 uri 匹配的请求分配给 servlet，调用 servlet 的 `service(ServletRequest req, ServletResponse res)` 方法执行后将结果返回，这样就解决了服务器与 Java 程序的适配问题。

那么一个 HTTP 请求从发到操作系统到被 Java 程序处理后再响应的整个流程如图（实线是请求，虚线是响应）：

<img src="/images/2019/servlet.png">

收到操作系统分配的字节流请求后，由服务器将这些字节流请求包装成 `ServletRequest` 后分派给 Java 程序处理后，Java 程序将响应结果写入 `ServletRequest` 传回给服务器， 服务器再将响应解析为字节流响应给操作系统，再由操作系统将结果通过网络连接响应给客户端。

#### Tomcat
服务进程的编写就要涉及到 Java 的 sockets 编程了，对 HTTP 请求的处理和封装非常繁杂，涉及到的服务器 I/O 编程也暂不是是我们要涉及的范围，引用现成的服务器组件就是我们最好的选择了。

Tomcat 应该是 Java 开发工程师接触最多的服务器了。它是由 Java 语言编写，运行在 JVM 上的，对 Java 开发者来说很亲切。背靠 Java 和 Apache 的大腿，又有 Spring 的默认支持，市场占有率一直居高不下，当然了，高性能和对各种 I/O 模型的支持才是它成功的关键。

我们并不需要使用它的高级功能，多路复用的 I/O 模型和它默认的单实例多线程线程模型就够了。

Tomcat 从 7 开始支持嵌入式功能，我们在框架内直接实例化 `org.apache.catalina.startup.Tomcat` 类，再调用其 `start()` 方法即可启动一个 Tomcat 线程，默认监听 8080 端口，开始接受操作系统分配的字节流。

## 请求分发
---
#### DispatcherServlet
在 servlet 最黑暗的年代，我们需要使用 servlet 就要先定义一个类实现 Servlet 接口，这个类的 service() 方法负责处理一个或一组 uri，然后将这个 servlet 实例配置在 `web.xml` 中，建立起 uri 和 servlet 的映射关系，请求到达服务器时由服务器来决定调用哪个 servlet。

而在大型项目中，往往会有多组多个 uri，这也就需要我们实例化 N 个 servlet 实例，再在 web.xml 中配置多个 servlet 映射，servlet 实例和 web.xml 的管理就是个大问题，一个大而杂乱的 web.xml 配置文件让每个人看了都头大。

Spring 出现后，便用强权手段结束了服务器对 web.xml 的统治，Spring 定义了一个 `DispatcherServlet`，在服务器注册 servlet 时，声明它能处理 uri 匹配 `"/"` 的请求，也就是说所有的 uri 都由 DispatcherServlet 来处理，这样分发请求的任务全被 Spring 承包了。

至于所有请求到达 DispatcherServlet 的 service 方法后，又该交给哪个类哪个方法执行，就是 Spring 的事了，也就进入了 Spring 容器时代。

#### 实现
Tomcat 的初始化很简单了，我们还要实现 Servlet 来受理请求，既然是模拟 Spring，我们也需要一个类似 DispatcherServlet 一样的"大总管"，我们暂时起名为 `WinterServlet`，方法里我们先留一些占位符，请求的分发我们在实现请求处理器后再进行分发。

```java
public class WinterServlet implements Servlet {
    @Override
    public void init(ServletConfig config) throws ServletException {
        System.out.println("server starting...");
    }

    @Override
    public ServletConfig getServletConfig() {
        return null;
    }

    @Override
    public void service(ServletRequest req, ServletResponse res) throws ServletException, IOException {
        // todo dispatch requests
        System.out.println("Hello World!");
    }

    @Override
    public String getServletInfo() {
        return "Winter Framework";
    }

    @Override
    public void destroy() {
        System.out.println("server stopped.");
    }
}

```

## 连接服务器
----
#### Tomcat 容器
在 Tomcat 容器中，servlet 并不是直接依附 Tomcat 而生的，Tomcat 中将容器分为四个级别，将容器的职责进行了解耦。

下图展示了 Tomcat 中各级别容器的关系：

<img src="/images/2019/tomcat_container.jpg">

- `Engine` 容器是最顶级的容器，可以理解为总控中心，在 Nginx 中就相当于 `nginx.conf` 文件中的配置。
- `Host` 容器对应一个虚拟主机，管理一个主机的信息和其子容器，相当于 Nginx 中的一个 `vhosts` 配置。
- `Context` 容器是最接近 servlet 的容器了，我们通过 context 可以设置一些资源属性和管理组件，Nginx 中好像并不到合适的对应，牵强一点的话就是一些 日志和静态文件配置吧。
- `Wrapper` 容器是对一个 servlet 的封装，负责 servlet 的加载、初始化、执行和销毁。

#### 实现
我们在之前声明的 WinterServlet 和 Tomcat 之间建立联系。

```java
   public void startTomcat() {
        // 简单地初始化一个 Tomcat 服务器
        tomcat = new Tomcat();
        tomcat.setPort(6699);
        tomcat.start();

        // 实例化一个 Context 容器的默认实现
        Context context = new StandardContext();
        context.setPath("");
        context.addLifecycleListener(new Tomcat.FixContextListener());

        // 实例化我们创建的 WinterServlet 并将它添加到 Context 容器中
        Servlet servlet = new WinterServlet();
        Tomcat.addServlet(context, "winterServlet", servlet).setAsyncSupported(true);
        context.addServletMappingDecoded("/*", "winterServlet"); // 注意其匹配的 URI 为所有

        tomcat.getHost().addChild(context);

        // 将 Tomcat 的运行包装成独立线程
        Thread awaitThread = new Thread("container-tomcat") {
            @Override
            public void run() {
                TomcatServer.this.tomcat.getServer().await();
            }
        };
        awaitThread.setContextClassLoader(getClass().getClassLoader());
        awaitThread.setDaemon(false);
        awaitThread.start();
```

## 小结
---
这样，一个最基本的 WEB 框架就 OK 了，虽然启动后所有的请求都只会响应 "Hello World!"。

Tomcat 容器的相关知识可以不必去纠结，毕竟太过于专有，但像 Servlet 和 Spring DispatcherServlet 这样的设计还是非常值得我们去研究和参考的。

{{ site.article.summary }}