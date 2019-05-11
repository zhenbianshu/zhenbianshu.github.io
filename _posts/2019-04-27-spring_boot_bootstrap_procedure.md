---
layout: post
title: "Spring-Boot 启动过程注解"
category: blog
tags: [Spring, framework, Java]
date: 2019-04-27 08:00:06 +0800
comments: true
hidden: true
---

## 前言
---


{{ site.article.copyright }}

## 过程
---

ApplicationContextInitializer 是一个接口，在 refresh 之前初始化 ConfigurableApplicationContext 的回调接口

SpringFactoriesLoader 是一个负责加载和初始化保存在 spring-factories 文件里的 spring 初始化工厂的类，会在 spring-boot 初始化时使用启用类加载器扫描所有 META-INF 路径下 spring-factories 文件，并将文件内的类全路径配置保存在 Map<ClassLoader, MultiValueMap<String, String>> cache 属性里。


spring-boot 启动过程
创建 springApplication
	通过当前classpath下的类是否存在进行服务类型推断： reactive servlet none
	设置 ApplicationContextInitializer 初始化器（可能有多个实现，选择当前能加载得到的）
		获取类加载器（当前线程类加载器）
		使用类加载器加载初始化器
			从缓存中获取到此 classLoader 能加载到的所有 spring-factories 配置
			缓存中不存在时使用当前加载器加载 jar 包里 META-INF/spring-factories 配置的路径，解析为类全路径
			将获取到的类全路径放到 cache <类加载器, <接口,List<类>>> 里
		用反射初始化从 spring-factories 里获取到的 ApplicationContextInitializer 的实例类
		将实例化的对象排序（通过 spring 的 Order 注解）后返回
	设置事件应用监听器(ApplicationListener)（步骤同 初始化器）
	通过栈底的 main 方法确定主类
调用 run 方法正式启动框架
	获取 RunListener, 步骤类似于初始化器，但传入了 SpringApplication 对象和参数，将对象内的监听器注入到 runListener 内
	向所有 listener 发送应用启动事件(日志应用、后台预初始化、代理应用、liquibase服务) （todo 各做了什么）
	准备环境
    	获取一个默认环境实例
    	配置环境实例
    		判断需要添加 ConversionService，获取 conversionService 实例
    			创建并获取单例的公共实例 conversionService
    				配置参数解析器
    				配置默认的格式化器和转换器
    		将获取到的 conversionSerivce 添加到环境中
    		将命令行和默认属性配置到环境中
    		将当前 profile 配置到环境中
    	向所有监听器发送环境准备 ApplicationEnvironmentPreparedEvent 事件
    	把环境绑定到 SpringApplication 应用实例上
    	把标准环境转换为一个 可配置环境 ConfigurableEnvironment
    	给环境添加配置属性源


	配置忽略 bean

	输出 banner

	创建上下文

	从工厂里获取异常报告器

	准备上下文

	刷新上下文

	处理刷新后






spring事件通知
事件广播器发送事件广播（ApplicationEventMulticaster）
	通过应用事件解析出事件类型（被包装为 ResolvableType）todo 为什么要包装
		如果是 Resolvable 类型就返回
		不是就包装为 Resolvable 类型
	事件广播器获取应用内的所有支持此事件类型的监听器，广播器内部有缓存 <事件源+事件类型, 监听器检索器（可以理解是监听器的缓存集合）>
	    把默认检索器里的事件取出来依次判断是否支持事件
	        将事件监听器包括一层（包装上监听的事件类型），成为事件监听器的适配器。通用监听器适配器存储了 <监听器类型,事件类型> 的映射。
	            解析监听器监听的事件类型 todo 代理是为了添加事件类型属性？
	            如果事件监听器是一个AOP代理，监听的事件类型是被代理者的事件类型
	        通过这个适配器的事件（ApplicationEvent）和 事件源 (SpringApplication 对象) 来判断是否支持事件。 todo 机制是？
	        如果支持，就放到监听器检索器里，缓存起来
	调用事件监听器，调用 Listener.onApplicationEvent(event)

## 小结
---

{{ site.article.summary }}