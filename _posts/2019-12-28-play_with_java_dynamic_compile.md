---
layout: post
title: "玩转 Java 动态编译"
date: 2019-12-28 10:00:06 +0800
category: blog
tags: [Java, Class Load, Byte Code]
comments: true

---
## 背景
---
#### 问题
之前的文章 [从 Spring 的环境到 Spring Cloud 的配置]({{ site.baseurl }}/2019/06/spring_cloud_properties_and_spring_environment.html) 中提到过我们在使用 Spring Cloud 进行动态化配置，它的实现步骤是先将动态配置通过 `@Value` 注入到一个动态配置 Bean，并将这个 Bean 用注解标记为 `@RefreshScope`，在配置变更后，这些动态配置 Bean 会被统一销毁，之后 Spring Cloud 的 `ContextRefresher` 会将变更后的配置作为一个新的 Spring Environment 加载进 ApplicationContext，由于 Scoped Bean 都是 Lazy Init 的，它们会在下一次使用时被使用新的 Environment 重新创建。

这套动态配置加载流程在使我们服务更加灵活的同时，也带来了很大的风险。首先从业务上，修改配置不像上线这么"重量级"，不必要找 QA 进行回归测试，这就有可能引发一系列奇怪的 Bug，而且长时间发现不了，另外，Spring Cloud 本身没有 "fallback" 机制，一旦配置的数据类型出了问题，就会导致服务不可用。为此，我给 Spring Cloud 提了个 issue [scope refreshed but new properties invalid leads to application unavailable](https://github.com/spring-cloud/spring-cloud-commons/issues/648) ，但作者认为变动太大，不好改也不必改。

其实我也明白这个问题的困境，每个人都得为自己要修改的配置负责，即使框架支持了 fallback，但将错误吞掉，配置修改后不生效也没什么变化可能也并不符合用户的期望。所以，尽量让用户要修改的配置正确成为了新的目标。

基于这种需求，我添加了一个动态配置的校验器，但实现里一部分代码来自 github，所以本文在总结思路的同时，也帮助我理解所有代码。

{{ site.article.copyright }}

#### 整体思路
由于框架层没法做太多事情，所以我的计划是将这些配置取出来，构造出一个独立的 Java 类，并在服务外新建一个 ApplicationContext 试图通过构造出来的 Java 类初始化一个 Spring Bean，如果这个 Spring Bean 初始化过程中报错了，说明配置是有问题的。

## 动态编译
---
#### 通过配置构造 Java 类
首先要通过 `.properties` 文件构造出一个 Java 类，但问题是在配置里我们是不知道这些配置将要被怎么使用的，不知道它要被 Spring EL 如何处理，又将被转成什么类型。

这里我采用的策略是给配置添加注释，注释里使用一定的格式声明 EL 表达式和要生成的字段类型，当然这种实现有点 low，有人提议把这些信息放到配置项的 key 里，之后会再进行优化。

把各个字段解析完成后放到准备到的类模板中，就生成了一个 `Config.java` 类字符串，之后就要将这个字符串编译成字节码并由 Spring 加载成 Bean。
#### JavaCompiler
由于 Config.java 是在运行时生成的，所以编译也只能在运行时了，万幸 Java 有提供 `javax.util.JavaCompiler` 类进行 Java 类的动态编译，省去了"写入文件 —— 命令行编译 —— 类加载 —— 清理文件" 的复杂流程。

JavaCompiler 的典型应用示例如下：

```java
        JavaCompiler javaCompiler = ToolProvider.getSystemJavaCompiler();
        JavaFileManager fileManager = javaCompiler.getStandardFileManager(null, null, null);
        CompilationTask task = javaCompiler.getTask(out, fileManager, diagnosticListener, options, classes, compilationUnits);
        task.call();
        FileObject outputFile = fileManager.getFileForOutput(null, null, null, null);
        outputFile.getCharContent(true);
```

流程如下图：JavaCompiler 通过 JavaFileManager 管理输入和输出文件，使用时通过 `getTask()` 方法提交一个异步 CompilationTask 进行代码编译，代码编译时，JavaCompiler 通过 `getCharContent()` 从传入的 compilationUnits 获取到 .java 文件内容，把编译后的结果调用 CompiledByteCode 的 `openOutputStream()` 方法写到 CompiledByteCode 对象里。

<img src="/images/2019/java_compiler.png">

#### 委托模式
由于 JavaCompiler 的默认实现都是通过文件进行的，这不符合我的期望，我需要的是输入和输出都在内存进行，所以需要修改 JavaCompiler 的实现，JavaCompiler、JavaFileManager、JavaFileObject(Input/Output) 分别使用委托模式实现。
其中 JavaFileManager 已经有 `ForwardingJavaFileManager` 的实现，JavaFileObject 也有 `SimpleJavaFileObject` 的实现，我们继承其实现后重写部分方法即可。

<img src="/images/2019/compiler_delegate.png">

我参考的源码： [GitHub-trung/InMemoryJavaCompiler](https://github.com/trung/InMemoryJavaCompiler)

## Spring Bean 实例化
---
要将 Config 类实例化成 Bean，我们可以在 xml 里预定义它，在编译结束后创建一个简易的 `FileSystemXmlApplicationContext` 实例化这个 xml 内的 Bean。

#### 类加载器
首先要让 Spring 能够加载到这些编译好的字节码，这就需要 ClassLoader 的配合。类加载器的默认实现不可能知道去加载我们内存里编译好的字节码，只好新加一个 ClassLoader，实现也很简单，继承 `ClassLoader` 抽象类，并实现 `findClass` 方法即可。

```java
class MemoryClassLoader extends ClassLoader {
	@Override
	protected Class<?> findClass(String name) throws ClassNotFoundException {
	    // 在 CompiledByteCode 类里将编译后的字节码放到 classLoader 的 classBytes 字段内。
		byte[] buf = classBytes.get(name);
		if (buf == null) {
			return super.findClass(name);
		}
		return defineClass(name, buf, 0, buf.length);
	}
}
```
#### 配置和实现
由于 Config Bean 的初始化依赖动态配置，我们还要把这些配置也添加到 Spring 环境内，我们知道 Spring 环境配置是由多个 `PropertySource` 构成的，向里面添加一个实现即可。然后就可以调用 application 的 `refresh()` 方法初始化上下文了，另外 Config Bean 被设置为懒加载了，不要忘记 get 一下使其被创建。

最终的代码如下：

```java
        FileSystemXmlApplicationContext applicationContext = new FileSystemXmlApplicationContext();
        applicationContext.setClassLoader(memoryClassLoader);
        applicationContext.setConfigLocation("classpath*:/test.xml");
        Map<String, Object> propertyMap = buildDynamicPropertyMap();
        MapPropertySource mapPropertySource = new MapPropertySource("validate_source", propertyMap);
        applicationContext.getEnvironment().getPropertySources().addFirst(mapPropertySource);
        applicationContext.refresh();
        applicationContext.getBean("config");

```

## 小结
---
小项目完成的过程中，复习了很多知识，也尝试了业务代码中几乎不会用到的设计模式，充满了挑战性。

当然它现在还有配置不够方便、错误提示不够明确、没解决配置 namespace 等问题，留到后面慢慢优化吧~

{{ site.article.summary }}