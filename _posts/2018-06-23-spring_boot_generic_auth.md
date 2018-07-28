---
layout: post
title: "在Spring-boot中实现通用Auth认证的几种方式"
date: 2018-06-23 20:00:06 +0800
comments: true
---

文章介绍了spring-boot中实现通用auth的四种方式，包括 传统AOP、拦截器、参数解析器和过滤器，并提供了对应的实例代码，最后简单总结了下他们的执行顺序。

## 前言
---

最近一直被无尽的业务需求淹没，没时间喘息，终于接到一个能让我突破代码舒适区的活儿，解决它的过程非常曲折，一度让我怀疑人生，不过收获也很大，代码方面不明显，但感觉自己抹掉了 java、Tomcat、Spring 一直挡在我眼前的一层纱。对它们的理解上了一个新的层次。

好久没输出了，于是挑一个方面总结一下，希望在梳理过程中再了解一些其他的东西。由于 Java 繁荣的生态，下面每一个模块都有大量的文章专门讲述。所以我选了另外一个角度，从实际问题出发，将这些分散的知识串联起来，各位可以作为一个综述来看。各个模块的极致详细介绍，大家可以去翻官方文档或看网络上的其他博客。

{{ site.article.copyright }}

需求很简单清晰，跟产品们提的妖艳需求一点也不一样：在我们的 web 框架里添加一个`通用`的 appkey 白名单校验功能，希望它的扩展性更好一些。

这个 web 框架是部门前驱者基于 spring-boot 实现的，介于业务和 Spring 框架之间，做一些偏向于业务的通用性功能，如 日志输出、功能开关、通用参数解析等。平常是对业务透明的，最近一直忙于把需求做好，代码写好，甚至从没注意过它的存在。

## 传统AOP
---
对于这种需求，首先想到的当然是 Spring-boot 提供的 AOP 接口，只需要在 Controller 方法前添加切点，然后再对切点进行处理即可。

### 实现
其使用步骤如下：

1. 使用 `@Aspect` 声明一下切面类 `WhitelistAspect`；
2. 在切面类内添加一个切点 `whitelistPointcut()`，为了实现此切点灵活可装配的能力，这里不使用 `execution` 全部拦截，而是添加一个注解 `@Whitelist`，被注解的方法才会校验白名单。
3. 在切面类中使用 spring 的 AOP 注解 `@Before` 声明一个通知方法 `checkWhitelist()` 在 Controller 方法被执行之前校验白名单。

	切面类伪代码如下

	```java
	@Aspect
public class WhitelistAspect {

    	@Before(value = "whitelistPointcut() && @annotation(whitelist)")
    	public void checkAppkeyWhitelist(JoinPoint joinPoint, Whitelist whitelist) {
        	checkWhitelist();
        	// 可使用 joinPoint.getArgs() 获取Controller方法的参数
        	// 可以使用 whitelist 变量获取注解参数
    	}


    	@Pointcut("@annotation(com.zhenbianshu.Whitelist)")
    	public void whitelistPointCut() {
    	}
}

	```
4. 在Controller方法上添加 `@Whitelist` 注解实现功能。


### 扩展
本例中使用了 注解 来声明切点，并且我实现了通过注解参数来声明要校验的白名单，如果之后还需要添加其他白名单的话，如通过 UID 来校验，则可以为此注解添加 `uid()` 等方法，实现自定义校验。

此外，spring 的 AOP 还支持 `execution（执行方法） 、bean（匹配特定名称的 Bean 对象的执行方法）`等切点声明方法和 `@Around（在目标函数执行中执行） 、@After（方法执行后）` 等通知方法。

如此，功能已经实现了，但领导并不满意=_=，原因是项目中 AOP 用得太多了，都用滥了，建议我换一种方式。嗯，只好搞起。

## Interceptor
---
Spring 的 拦截器(Interceptor) 实现这个功能也非常合适。顾名思义，拦截器用于在 Controller 内 Action 被执行前通过一些参数判断是否要执行此方法，要实现一个拦截器，可以实现 Spring 的 `HandlerInterceptor` 接口。

### 实现
实现步骤如下：

1. 定义拦截器类 `AppkeyInterceptor` 类并实现 HandlerInterceptor 接口。
2. 实现其 `preHandle()` 方法；
3. 在 preHandle 方法内通过注解和参数判断是否需要拦截请求，拦截请求时接口返回 `false`；
4. 在自定义的 `WebMvcConfigurerAdapter` 类内注册此拦截器；

`AppkeyInterceptor` 类如下：

```java
@Component
public class WhitelistInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        Whitelist whitelist = ((HandlerMethod) handler).getMethodAnnotation(Whitelist.class);
        // whitelist.values(); 通过 request 获取请求参数，通过 whitelist 变量获取注解参数
        return true;
    }

    @Override
    public void postHandle(HttpServletRequest request, HttpServletResponse response, Object handler, ModelAndView modelAndView) throws Exception {
		// 方法在Controller方法执行结束后执行
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) throws Exception {
		// 在view视图渲染完成后执行
    }
}
```

### 扩展
要启用 拦截器还要显式配置它启用，这里我们使用 `WebMvcConfigurerAdapter` 对它进行配置。需要注意，继承它的的 `MvcConfiguration` 需要在 ComponentScan 路径下。


```java
@Configuration
public class MvcConfiguration extends WebMvcConfigurerAdapter {
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new WhitelistInterceptor()).addPathPatterns("/*").order(1);
        // 这里可以配置拦截器启用的 path 的顺序，在有多个拦截器存在时，任一拦截器返回 false 都会使后续的请求方法不再执行
    }
}
```

还需要注意，拦截器执行成功后响应码为 `200`，但响应数据为空。

当使用拦截器实现功能后，领导终于祭出大招了：我们已经有一个 Auth 参数了，appkey 可以从 Auth 参数里取到，可以把在不在白名单作为 Auth 的一种方式，为什么不在 Auth 时校验？emmm... 吐血中。

## ArgumentResolver
---
参数解析器是 Spring 提供的用于解析自定义参数的工具，我们常用的 `@RequestParam` 注解就有它的影子，使用它，我们可以将参数在进入Controller Action之前就组合成我们想要的样子。Spring 会维护一个 `ResolverList`， 在请求到达时，Spring 发现有自定义类型参数（非基本类型）， 会依次尝试这些 Resolver，直到有一个 Resolver 能解析需要的参数。要实现一个参数解析器，需要实现 `HandlerMethodArgumentResolver` 接口。

### 实现
1. 定义自定义参数类型 `AuthParam`，类内有 appkey 相关字段；
2. 定义 `AuthParamResolver` 并实现 HandlerMethodArgumentResolver 接口；
3. 实现 `supportsParameter()` 接口方法将 AuthParam 与 AuthParamResolver 适配起来；
4. 实现 `resolveArgument()` 接口方法解析 reqest 对象生成 AuthParam 对象，并在此校验 AuthParam ，确认 appkey 是否在白名单内；
5. 在 Controller Action 方法上签名内添加 AuthParam 参数以启用此 Resolver;

实现的 AuthParamResolver 类如下：

```java
@Component
public class AuthParamResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.getParameterType().equals(AuthParam.class);
    }

    @Override
    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mavContainer, NativeWebRequest webRequest, WebDataBinderFactory binderFactory) throws Exception {
        Whitelist whitelist = parameter.getMethodAnnotation(Whitelist.class);
        // 通过 webRequest 和 whitelist 校验白名单
        return new AuthParam();
    }
}
```

### 扩展
当然，使用参数解析器也需要单独配置，我们同样在 `WebMvcConfigurerAdapter ` 内配置：

```java
@Configuration
public class MvcConfiguration extends WebMvcConfigurerAdapter {

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> argumentResolvers) {
        argumentResolvers.add(new AuthParamResolver());
    }
}
```

这次实现完了，我还有些不放心，于是在网上查找是否还有其他方式可以实现此功能，发现常见的还有 `Filter`。

## Filter
---
Filter 并不是 Spring 提供的，它是在 Servlet 规范中定义的，是 Servlet 容器支持的。被 Filter 过滤的请求，不会派发到 Spring 容器中。它的实现也比较简单，实现 `javax.servlet.Filter ` 接口即可。

由于不在 Spring 容器中，Filter 获取不到 Spring 容器的资源，只能使用原生 Java 的 ServletRequest 和 ServletResponse 来获取请求参数。

另外，在一个 Filter 中要显示调用 FilterChain 的 doFilter 方法，不然认为请求被拦截。
实现类似：

```java
public class WhitelistFilter implements javax.servlet.Filter {

    @Override
    public void init(FilterConfig filterConfig) throws ServletException {
		// 初始化后被调用一次
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain) throws IOException, ServletException {
    	// 判断是否需要拦截
       chain.doFilter(request, response); // 请求通过要显示调用
    }

    @Override
    public void destroy() {
    	// 被销毁时调用一次
    }
}
```
### 扩展
Filter 也需要显示配置：

```java
@Configuration
public class FilterConfiguration {

    @Bean
    public FilterRegistrationBean someFilterRegistration() {
        FilterRegistrationBean registration = new FilterRegistrationBean();
        registration.setFilter(new WhitelistFilter());
        registration.addUrlPatterns("/*");
        registration.setName("whitelistFilter");
        registration.setOrder(1); // 设置过滤器被调用的顺序
        return registration;
    }
}
```

## 小结
---
四种实现方式都有其适合的场景，那么它们之间的调用顺序如何呢？

Filter 是 Servlet 实现的，自然是最先被调用，后续被调用的是 Interceptor 被拦截了自然不需要后续再进行处理，然后是 参数解析器，最后才是 切面的切点。我将四种方式在一个项目内全部实现后，输出日志也证明了这个结论。

跳出具体实现，转身来看这些实现，其实都有一些面向切面的影子。由于之前自己的编程方式更偏向于面向过程编程，在使用 Java 面向对象后对比 AOP 和 面向过程中的勾子，有些感悟，改日写文整理一下。

{{ site.article.summary }}

参考文章：

[关于 Spring AOP (AspectJ) 你该知晓的一切](https://blog.csdn.net/javazejian/article/details/56267036)