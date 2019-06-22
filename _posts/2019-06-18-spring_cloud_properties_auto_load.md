---
layout: post
title: "Spring Cloud 的配置管理"
category: blog
tags: [Java, Spring Cloud, config, Properties]
date: 2019-06-18 08:00:06 +0800
comments: true
---

## 需求
---
不知不觉，web 开发已经进入 "微服务"、"分布式" 的时代，致力于提供通用 Java 开发解决方案的 Spring 自然不甘人后，提出了 Spring Cloud 来扩大 Spring 在微服务方面的影响，也取得了市场的认可，在我们的业务中也有应用。

前些天，我在一个需求中也遇到了 spring cloud 的相关问题。我们在用的是 Spring Cloud 的 config 模块，它是用来支持分布式配置的，原来单机应用在使用了 Spring Cloud 之后，可以支持配置的动态修改和重新加载，原来我们使用第三方存储配置，自己在业务代码里使用轮询并实现配置的重新加载，Spring Cloud 将其抽离为框架，并很好的融入到 Spring 原有的配置和 Bean 模块内。

虽然在解决需求问题时走了些弯路，但也借此机会了解了 Spring Cloud 的一部分，抽空总结一下问题和在查询问题中了解到的知识，分享出来让再遇到此问题的同学少踩坑吧。

{{ site.article.copyright }}

## 背景和问题
---
我们的服务原来有一批单机的配置，由于同一 key 的配置太长，于是将其配置为数组的形式，并使用 Spring Boot 的 `@ConfigurationProperties` 和 `@Value` 注解来解析为 Bean 属性。

properties 文件配置像：

```
test.config.elements[0]=value1
test.config.elements[1]=value2
test.config.elements[2]=value3

```
在使用时：

```java

@ConfigurationProperties(prefix="test.config")
Class Test{
    @Value("${#elements}")
    private String[] elements;
}
```
这样，Spring 会对 Test 类自动注入，将数组 [value1,value2,value3] 注入到 elements 属性内。

而我们使用 Spring Cloud 自动加载配置的姿势是这样：

```java
@RefreshScope
class Test{
    @Value("${test.config.elements}")
    private String[] elements;
}
```

使用 `@RefreshScope` 注解的类，在环境变量有变动后会自动重新加载，将最新的属性注入到类属性内，但它却不支持数组的自动注入。

而我的目标是能找到一种方式，使其即支持注入数组类型的属性，又能使用 Spring Cloud 的自动刷新配置的特性。

## 环境和属性
---
无论Spring Cloud 的特性如何优秀，在 Spring 的地盘，还是要入乡随俗，和 Spring 的基础组件打成一片。所以为了了解整个流程，我们就要先了解 Spring 的基础。

Spring 是一个大容器，它不光存储 Bean 和其中的依赖，还存储着整个应用内的配置，相对于 BeanFactory 存储着各种 Bean，Spring 管理环境配置的容器就是 `Environment`，从 Environment 内，我们能根据 key 获取所有配置，还能根据不同的场景（Profile，如 dev,test,prod）来切换配置。

但 Spring 管理配置的最小单位并不是属性，而是 `PropertySource` (属性源)，我们可以理解 PropertySource 是一个文件，或是某张配置数据表，Spring 在 Environment 内维护一个 PropertySourceList，当我们获取配置时，Spring 从这些 PropertySource 内查找到对应的值，并使用 `ConversionService` 将值转换为对应的类型返回。

## Spring Cloud 配置刷新机制
---
#### 分布式配置
Spring Cloud 内提供了 `PropertySourceLocator` 接口来对接 Spring 的 PropertySource 体系，通过 PropertySourceLocator，我们就拿到一个"自定义"的 PropertySource，Spring Cloud 里还有一个实现 `ConfigServicePropertySourceLocator`，通过它，我们可以定义一个远程的 ConfigService，通过公用这个 ConfigService 来实现分布式的配置服务。

从 `ConfigClientProperties` 这个配置类我们可以看得出来，它也为远程配置预设了用户名密码等安全控制选项，还有 label 用来区分服务池等配置。

#### 配置刷新
远程配置有了，接下来就是对变化的监测和基于配置变化的刷新。

Spring Cloud 提供了 `ContextRefresher` 来帮助我们实现环境的刷新，其主要逻辑在 `refreshEnvironment` 方法和 `scope.refreshAll()` 方法，我们分开来看。

首先是 refreshEnvironment 方法。

```
Map<String, Object> before = extract(this.context.getEnvironment().getPropertySources());
		addConfigFilesToEnvironment();
		Set<String> keys = changes(before,extract(this.context.getEnvironment().getPropertySources())).keySet();
		this.context.publishEvent(new EnvironmentChangeEvent(context, keys));
		return keys;
```

它读取了环境内所有 PropertySource 内的配置后，重新创建了一个 SpringApplication 以刷新配置，再次读取所有配置项并得到与前面保存的配置项的对比，最后将前后配置差发布了一个 `EnvironmentChangeEvent` 事件。


```
    public void refreshAll() {
		super.destroy();
		this.context.publishEvent(new RefreshScopeRefreshedEvent());
	}
```
而 scope.refreshAll 则更"野蛮"一些，直接销毁了 scope，并发布了一个 RefreshScopeRefreshedEvent 事件，scope 的销毁会导致 scope 内（被 RefreshScope 注解）所有的 bean 都会被销毁。而这些被强制设置为 lazyInit 的 bean 再次创建时，也就完成了新配置的重新加载。

## 属性的重新绑定
---
我们再来看一下  EnvironmentChangeEvent 事件的处理。


rebinder 销毁重新创建？


## 扩展
---
修改 env

## 小结
---

{{ site.article.summary }}
