---
layout: post
title: "Mini Spring-Boot（四）：Bean 管理"
category: blog
tags: [Spring, framework, Java]
date: 2019-03-23 08:00:06 +0800
comments: true
hidden: true
---

## 续言
---
要说 Spring 框架中哪个概念最出名的话，非 Bean 莫属了，由它延伸而出的依赖注入和控制反转也是设计模式中的重要概念，其简洁和高效的特性被开发者津津乐道，各个框架都纷纷效仿，今天我们也给 winter 中添加这么一个特性。

{{ site.article.copyright }}

## Bean 维护
---
#### Bean
`Bean` 的实质没什么特殊的，它本质上是一类特殊的`对象`，只不过它的生命周期不同于一般对象的朝生暮死，而是在服务初始化、JVM 启动时开始，在服务结束 JVM 销毁时结束。除此之外，由于其在整个虚拟机中可见，且维护成本较高，它一般是`单例`存在的。

基于这些特性，Bean 的存在使框架更为高效。

- 在项目启动时初始化，使用时不再需要初始化，大大加快了使用 bean 对象时的效率，
- bean 通过框架进行统一管理，代码中少了很多 new 某个 service 对象的重复代码。
- 减少了很多对象使用后抛弃的情况，大大减轻了垃圾回收器的压力。
- bean 的依赖关系通过框架进行管理，我们也不必再在创建对象时 set 各种 property，更不必处理链式依赖时，各种 new 和 set。
- bean 保存到框架中后，我们对某些类进行统一操作更简单了，也让我们统一代理类的行为成为了可能。

Bean 也是一种对象，而对象并不需要也没办法再进行包装，所以 Spring 中并没有包装 Bean 的定义。而上节中我们说到，哪些类需要实例化 Bean 是需要一个标志的，我们还需要添加一个 `@Bean` 注解，类似于 Spring 中的 `@Service @Component` 等。

#### beanFactory
Bean 在虚拟机中通过 `BeanFactory` 维护，顾名思义，我们可以理解它就是工厂模式中创建对象的工厂，我们也能从这种 Bean 工厂内获取到对应的 Bean。

我们想像中的工厂是生产某类东西的地方，而 BeanFactory 在 Spring 中是一个接口，其仅仅定义了一系列获取 Bean 的接口方法，并没有限制这些 Bean 是从哪来的。通过 Bean 工厂，我们可以通过类型、名字获取到对应的 Bean，也可以判断某个 bean 是否在工厂内。

由于 Spring 特性丰富，还有对 Bean 别名定义的接口方法，不过对我们这个简单的框架来说，实现通过名字和类型获取 Bean 就够了。

```java
public interface BeanFactory {
    Object getBean(String beanName);

    Object getBean(Class<?> cls);
}
```
#### bean 创建
bean 的创建我们同样使用上节中用过的`反射`，`cls.newInstance()` 一行代码即可。

另一个重点是 bean 的保存，我们的要求是 bean 在全局内可见，而且可查找，这就需要我们有一个全局容器能够存储各个类，这种情况下，静态属性是最好的选择。
除此之个，容器的类型我们要选择 `ConcurrentHashMap`，用以避免 bean 操作时的冲突问题，key 是 bean 的名字，我们参照 Spring 中 bean 名字的定义，使用 `类名首字母小写`。

又由于我们还需要通过类型查找 bean，还需要添加一个类名到 Bean 的映射。

#### IOC 和 DI

## 小结
---

{{ site.article.summary }}