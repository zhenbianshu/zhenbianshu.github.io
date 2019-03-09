---
layout: post
title: "写自己的 Spring-Boot（三）：资源"
category: blog
tags: [Spring, framework, Java]
date: 2019-03-09 08:00:06 +0800
comments: true
hidden: true
---

## 续言
---
上篇博客中，我们向项目中集成了 Tomcat 支持了服务以 jar 包方式运行，并将对 Tomcat 所有 URI 的请求都收束到一个 WinterServlet 里， 框架已经能简单地运行了。

我们不可能在 WinterServlet 里执行所有的业务逻辑，所以我们还要把统一到的所有请求再根据请求 URI 分发到对应的 Action 里。

首先，我们要添加一些跟 Spring 类似的 `@Controller, @RequestMapping, @RequestParam` 等注解，并将其用在我们添加的测试代码中。将项目内注解为 @Controller 的类都找出来，我们只能进行遍历了，现在要解决的是如何能获取到项目内所有的类。

{{ site.article.copyright }}

## 文件与资源
---
#### ClassLoader
我们的类定义与 JVM 交互的媒介是文件，我们编写的所有代码，本质上都是 `.java` 文件，打包时，会被编译为 `.class` 文件。既然是文件，就会有路径，我们要获取项目内所有的类，就需要通过项目路径找到所有类文件，并将这些文件解析为 Java 类定义。

JVM 加载类使用的是 ClassLoader 类加载器，我们要获取所有的类的行为，本质上就是实现一个类加载器，只不过普通的类加载器是传入一个类名，返回一个类定义，而我们是以项目（包）为参数，获取到项目（包）下所有类定义。

由上可知，加载类即加载文件，所以类加载器同样可以用来获取文件，而文件在 JVM 里统一抽象为 `Resource` 资源，所以类加载器加载资源的方法为 `getResource()`。
#### 各层级的类加载器
JVM 的类加载器是有继承层级关系的，我们可以用一个测试类来看一下各们层级的类加载器分别是什么。

```java
    public static void main(String[] args) throws Exception {
        ClassLoader classLoader = Test.class.getClassLoader();
        System.out.println(classLoader); // sun.misc.Launcher$AppClassLoader@
        System.out.println(classLoader.getParent()); // sun.misc.Launcher$ExtClassLoader
        System.out.println(classLoader.getParent().getParent()); // null
    }
```
可以看到：

- AppClassLoader: 最底层的是应用类加载器，它主要负责加载应用内部的类和资源。它的扫描路径为项目根目录下 `classpath` 文件夹或项目 `-classpath` 参数所指路径文件夹下的文件资源。
- ExtClassLoader: 应用类加载器的父类为扩展类加载器，这里的扩展指的是 JVM 的扩展。它主要加载 `$JAVA_HOME/jdk/ext/lib` 文件夹下的类和资源。
- BootstrapClassLoader: 扩展类加载器的父类输出为 null，但实际上它是有值存在的，它是由 C/C++ Native 实现的启动类加载器，它主要负责加载 `$JAVA_HOME/lib` 和启动参数 `Xbootclasspath`属性值目录下的类文件和资源。

当然了，我们还可以自定义自己的类加载器，一般需要继承应用类加载器，并按需重写它的 `findClass()、getResource()` 等方法。

#### 双亲委派
这么多层级的类加载器，JVM 一定要规范一下它们的调用顺序，才不致于调用混乱，这个规范就是`双亲委派`模型了。

JVM 规定，类加载器尝试加载类`前`先尝试使用父类加载器加载类，父类加载不到时才会使用子类加载，也就是说类加载器的调用顺序为：`启动类加载器、扩展类加载器、应用类加载器、自定义类加载器`。

这么规定的主要是为了安全，试想，如果不这么规定，先从最底层的自定义加载器尝试起的话，有程序员不小心在 classpath 下添加了一个 String 类，那么它就会被自定义加载器加载到，整个系统的 String 类都被替换掉了。

而双亲委派模型的存在就添加了一种隐形权限，将每种类加载器的可加载范围都控制住了。

#### 资源



## Actions
---

## 序列化
---

## 小结
---

{{ site.article.summary }}