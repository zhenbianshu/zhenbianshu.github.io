---
layout: post
title: "SpringBoot 启动过程（下）组件初始化"
category: blog
tags: [Spring, Tomcat]
date: 2019-08-17 11:00:06 +0800
comments: true
---

## 前言
---
上篇文章介绍了 JVM 是怎么加载到 Spring 的，分别介绍了 Jar 包机制的 Spring 唤起 Tomcat 方式和 War 包时的 Tomcat 自动加载 Spring 方式，这篇文章就从内部来介绍一下 Spring 服务是如何启动起来的。

{{ site.article.copyright }}

## 概念和组件
---
在介绍 SpringBoot 启动流程之前，我们需要先了解一下 SpringBoot 启动时的重要概念和组件，它们或有着重要的意义，或在启动过程中起着举足轻重的作用。

#### ApplicationContext
首先是 `ApplicationContext`，即应用上下文，Spring 的整个启动过程就是创建并完善一个应用上下文的过程，我们看一下它的接口定义：

```java
public interface ApplicationContext extends EnvironmentCapable, ListableBeanFactory, HierarchicalBeanFactory, MessageSource, ApplicationEventPublisher, ResourcePatternResolver{}
```
可以看到，这个接口继承了很多接口，可以理解它是多个 Spring 接口的整合器，把多个接口的功能都整合到自己身上。在 Spring 应用里，它的地位也是如此，ApplicationContext 就是整合 Spring 应用各个功能的`"门面"`，由它统一向应用提供 Spring 的服务，SpringApplication 的 run 方法就是返回一个 ApplicationContext。从接口可以看出来它能提供的服务有：

- 从 EnvironmentCapable、ResourcePatternResolver 接口，它能提供获取或修改环境配置的功能，如 [从 Spring 的环境到 Spring Cloud 的配置]({{ site.baseurl }}/2019/06/spring_cloud_properties_and_spring_environment.html) 一文中提到的获取属性配置源和 profile 解析剖面的能力。
- 从 ListableBeanFactory、HierarchicalBeanFactory 接口，ApplicationContext 能提供获取各种 Bean 的能力。事实上我们在 JSP 等无法注入 Bean 的地方想要获取到 Spring 内部已创建的 Bean 时，首要步骤就是从 ServletContext 内获取到 ApplicationContext 的实例。
- 从 MessageSource 接口，我们可以从 ApplicationContext 中获取到各种资源。
- 从 ApplicationEventPublisher 接口，我们可以获得注册监听器，发布事件的能力。

可以说，了解 SpringContext 的概念和重要意义，是明白 Spring 启动过程的前提。
#### ApplicationEventPublisher
由于 SpringBoot 的启动过程非常复杂，如果使用传统的方法调用方式，代码会非常难以冗长且不利用扩展，像下面这样

```
if (模块 A 完成) {
    X 服务.call();
    Y 服务.call();
    Z 服务.call();
    ... M 服务.call(); ？
}
if ...
```
而 Spring 事件通知机制就设计得非常巧妙，启动过程中上下文只依赖 EventListener 的接口，而不去管它的实现，实现了依赖倒置。

Spring 在启动过程中获取到所有事件监听器的实例，识别出事件监听器要监听的事件类型，并使用 `ApplicationEventMulticaster` 保存事件类型到事件监听器的映射。有事件发布时，不再需要考虑调用哪个服务，直接调用对应事件类型的监听器 `onApplicationEvent()` 方法即可，而且使用线程池异步执行也不会阻塞正常的启动流程。事件发布的代码如下：

```java
public void multicastEvent(final ApplicationEvent event, @Nullable ResolvableType eventType) {
		ResolvableType type = (eventType != null ? eventType : resolveDefaultEventType(event));
		for (final ApplicationListener<?> listener : getApplicationListeners(event, type)) {
			Executor executor = getTaskExecutor();
			if (executor != null) {
				executor.execute(() -> invokeListener(listener, event));
			}
			else {
				invokeListener(listener, event);
			}
		}
	}
```

在应用层，事件监听器的功能被 Spring Bean 的依赖注入完全替代了，所以我们可能用得不多，但要了解 SpringBoot 的启动流程，就不能只关注代码上的流程，还要考虑被事件监听器隐藏了的代码实现了。

#### Spring 的 SPI 机制
上篇文章中我们介绍 Spring War 包方式启动时提到了 Java 的 SPI 机制，而 Spring 内也提供了相似的功能。

在浏览启动流程代码的过程中，我们会经常看到 `List<String> names = SpringFactoriesLoader.loadFactoryNames(type, classLoader);` 类似的代码，传入参数为类名和类加载器，就能获取到一组类的全限定名，它的实现就是靠着 Spring 的`工厂加载机制`。

类似于 SPI 在 `META-INF/services` 内预设接口和实现，这种机制的实现是靠着在 `META-INF/spring.factories` 文件内写入 `接口=实现1,实现2...` 的方式来实现的，其解析方式也非常简单，如下：

```java
Enumeration<URL> urls = (classLoader != null ?
		classLoader.getResources(FACTORIES_RESOURCE_LOCATION) :
		ClassLoader.getSystemResources(FACTORIES_RESOURCE_LOCATION));
result = new LinkedMultiValueMap<>();
while (urls.hasMoreElements()) {
	URL url = urls.nextElement();
	UrlResource resource = new UrlResource(url);
	Properties properties = PropertiesLoaderUtils.loadProperties(resource);
	for (Map.Entry<?, ?> entry : properties.entrySet()) {
		List<String> factoryClassNames = Arrays.asList(
				StringUtils.commaDelimitedListToStringArray((String) entry.getValue()));
		result.addAll((String) entry.getKey(), factoryClassNames);
	}
}
cache.put(classLoader, result);
return result;
```
靠着这种机制，Spring 在最初加载时就能不扫描多个类也能很快查找到各个内部接口在不同包里的实现了，是实现依赖倒置的一种重要方式。

## 流程
---
介绍完了一些概念和组件，再通过 debug 跟踪看代码，整理出 SpringBoot 的启动流程就简单一些了，下面我就挑选一些重要节点来讲，将一些发布事件等细枝末节忽略掉。

#### 类型推断
由于现在 Spring 支持多种服务模式，既支持我们常见的 Servlet 模式，也支持异步的 Reactive 模式，还可以实现非 Web 的独立模式，所以创建 Spring 应用的首要步骤是推断它是什么类型。

Spring 应用类型的推断主要靠检测某些类的存在，如果你引入了 reactive 相关的包，那么类加载器就能加载到 `org.springframework.web.reactive.DispatcherHandler` 类。而如果没有任务 web 相关的包存在，Spring 就会认为你要初始化一个独立存在的非 Web 应用。

获取到服务类型之后，后面创建的 ApplicationContext 也会选择对应的类型，多种类型的 ApplicationContext 都继承自 `AbstractApplicationContext`，一些公共方法也都在这个抽象类内。在跟踪代码，要查看 ApplicationContext 的具体实现时，就需要根据推断的类型去对应的应用上下文实现内去了。

#### 创建 ApplicationContext
要创建一个 ApplicationContext，需要创建一个 Environment，并使用 PropertySource 里配置的属性配置这个环境，最后将环境与应用上下文进行绑定，这些都在 `SpringApplication.run()` 方法内实现。

将环境配置好后，就要调用 `ApplicationContext.refresh()` 方法来刷新整个上下文了，而 Bean 的创建等重要逻辑都在上下文的刷新中实现。

#### 创建 Bean
Bean 的创建流程我们分步来讲：

1. prepareRefresh(): Bean 的创建往往需要读取配置内的属性，所以创建 Bean 之前需要将全局内的属性替换为对应的值，并且验证其有效性。
2. obtainFreshBeanFactory(): 创建一个存储 Bean 的容器 `BeanFactory`，并将 xml 或 @Configuration、注解声明的 Bean 定义加载到 BeanFactory。
3. registerBeanPostProcessors(beanFactory): 注册 `BeanPostProcessor`，这一步是我们能影响 Bean 创建流程的一个重要节点。
4. finishBeanFactoryInitialization(beanFactory): 实现化 BeanFactory 内所有非 LazyInit 的 Bean。
5. finishRefresh(): 清理资源，发布创建完成事件。

## 小结
---
Spring 是一个非常精密而完善的工程，虽然不喜欢它的层层封装，但也不得不承认它的设计非常完整而规范，说是 Java 语言最重要的生态也不为过了。

在有业务需求之前 SpringBoot 就先看到这里了，各个模块的细节等遇到相关问题再说。

{{ site.article.summary }}
