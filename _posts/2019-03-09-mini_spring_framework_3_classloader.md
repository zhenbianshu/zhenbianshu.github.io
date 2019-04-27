---
layout: post
title: "Mini Spring-Boot（三）资源加载"
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

项目地址：[winter-zhenbianshu-Github](https://github.com/zhenbianshu/winter-framework)

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

## 类定义
---
了解了文件和资源的相关知识后，实现扫描并加载项目内的类定义也就不是难事了。

#### 包名到资源的转换
由于我们要加载的类文件都在项目入口类所属根目录下，所以要加载这些类文件并不需要我们添加新的类加载器，使用 AppClassLoader 就行，主要是如何通过当前条件获取到文件内容，并对文件内容作出处理。

在项目中，启动类一般都在包路径下，我们可以通过启动类获取到包名。而由于包名和文件目录的一一对应，我们可以通过包名获取到文件目录。获取到文件目录后，类加载器就可以直接将文件资源加载进来了。

示例代码如下;

```java
    public static List<Class<?>> getClasses(String packageName) throws ClassNotFoundException, IOException {
        ClassLoader classLoader = Thread.currentThread().getContextClassLoader();
        String path = packageName.replace(".", "/");
        Enumeration<URL> resources = classLoader.getResources(path);
        // 获取到包根目录下所有资源（文件或文件夹）
        List<File> dirs = new ArrayList<>();
        while (resources.hasMoreElements()) {
            URL resource = resources.nextElement();
            dirs.add(new File(resource.getFile()));
        }
        // 通过文件或文件夹获取到类定义
        List<Class<?>> classes = new ArrayList<>();
        for (File directory : dirs) {
            // 由于文件夹可能有多层嵌套，这里使用递归方法 findClass 扫描所有资源
            classes.addAll(findClass(directory, packageName));
        }
        return classes;
    }
```

#### 类名到类定义
Java 内的 `File` 对应 Linux 操作系统内的文件，区分文件和文件夹可以使用 `File.isDirectory()` 方法，如果是文件夹，还需要继续递归遍历。但并不是所有的文件都符合我们的要求，以 `.class` 结尾的类文件才是我们的目标。此外，由于每个类和包在一起才能标志它的唯一性，不要忘记将包名也添加到类名前面。

而由类名到到 JVM 内的类定义，我们使用 `Class.forName(String className)` 方法，这个方法会调用类加载器查找对应的类并将其装载到虚拟机中，将类初始化后，把类的 `Class` 对象返回。如果我们实现了自定义的类加载器，可以使用它的重载方法 `Class.forName(String name, boolean initialize, ClassLoader loader)` 来加载类。

也就是说，我们上面的查找文件的步骤并没有接触类的二进制文件，而是仅获取到类名，使用类名调用 Class.forName 方法时，当前类加载器会再执行正常的加载流程，通过类名获取到包名，再获取到文件路径，拿到类的二进制文件后装载到虚拟机中。

从文件到类定义的示例代码如下：

```java
    private static List<Class<?>> findClass(File directory, String packageName) throws ClassNotFoundException {
        List<Class<?>> classes = new ArrayList<>();
        if (!directory.exists()) {
            return classes;
        }
        File[] files = directory.listFiles();
        for (File file : files) {
            if (file.isDirectory()) {
                classes.addAll(findClass(file, packageName + "." + file.getName()));
            } else if (file.getName().endsWith(".class")) {
                // 删除掉文件名中的 .class 后缀
                classes.add(Class.forName(packageName + "." + file.getName().substring(0, file.getName().length() - 6)));
            }
        }
        return classes;
    }
```

## 控制器
---
类是 Java 服务的核心，有了所有的类定义，我们对整个项目就有一定的掌控力了。

#### 注解
由于框架的使用者不可控，我们不可能通过属性名、方法名、类名或包名来约定某些类的作用，所以我们需要在类上打上一种 `"标记"` 用来标志类的作用。

幸好 Java 为开发者提供了 `注解` 这一神奇特性，注解对于普通业务开发作用不大，但对框架或底层开发有着非凡的意义，Spring 中我们经常使用的 `@Service、@RequestMapping、@Autowired` 就起到这种作用，使用注解，我们不仅能为类添加属性，还可以为类属性、类方法添加属性，如 @Service 能添加 name 属性，以区分同一接口的不同实现。

注解的属性用`元注解`来标记，共有四种元注解，分别是：

- @Target，用来标记注解作用的类型。
- @Retention，用来标记注解在目标上保留的生命周期。
- @Document，被标记的目标会被 javadoc 工具文档化。
- @Inherited，被标记的目标类的子类会继承父类的注解。

Winter 也需要一些注解，用来标记控制器、方法和参数，参照 Spring，我们添加 `@Controller、@RequestMapping、@RequestParam` 三种注解分别标记控制器、请求映射处理器和处理器参数。

#### 请求映射处理器
在 MVC 框架中，每一种不同前缀的 URI 是一种请求映射，如 `/test*` 匹配所有 URI 以 test 开头的请求，而控制器内处理 URI 为 /test* 的一个方法称为一个请求映射处理器。请求映射处理器才是 MVC 中的最小单位，一个控制器内可以存在多个请求控制器。

我们首先定义好请求映射请求器的数据结构:

```java
public class MappingHandler {
    private Method method; // 标记请求映射处理器对应的方法
    private Class<?> cls;  // 使用反射调用请求映射处理器方法需要类支持
    private String[] argNames; // 调用请求映射处理器需要的参数
    private String uri;   // 请求映射处理器要处理的 URI

    public boolean handle(ServletRequest req, ServletResponse res) throws InvocationTargetException, IllegalAccessException, IOException {
        // todo handle request and save res to response
    }
}
```

#### 初始化
接下来我们需要遍历所有类定义，通过 `@Controller` 注解找到所有控制器，再通过 `@RequestMapping` 初始化所有的请求映射控制器，至于初始化好的请求映射处理器，我们放到一个静态类中即可。

```java
    public static void initializeHandler(List<Class<?>> classList) {
        for (Class<?> cls : classList) {
            // 只有被 @Controller 注解标记为控制器的类才需要处理
            if (cls.isAnnotationPresent(Controller.class)) {
                initMappingHandler(cls);
            }
        }
    }

    private static void initMappingHandler(Class<?> cls) {
        Method[] methods = cls.getDeclaredMethods();
        for (Method method : methods) {
            // 只处理被 @RequestMapping 标记的请求映射处理器方法
            if (!method.isAnnotationPresent(RequestMapping.class)) {
                continue;
            }

            // 通过 @RequestMapping 保存要处理的请求映射
            String uri = method.getDeclaredAnnotation(RequestMapping.class).value();
            Parameter[] parameters = method.getParameters();
            List<String> paramNameList = new ArrayList<>();
            for (Parameter parameter : parameters) {
                if (!parameter.isAnnotationPresent(RequestParam.class)) {
                    continue;
                }
                // 通过 @RequestParam 保存请求中的参数名
                paramNameList.add(parameter.getDeclaredAnnotation(RequestParam.class).value());
            }
            String[] paramNames = paramNameList.toArray(new String[paramNameList.size()]);

            MappingHandler mappingHandler = new MappingHandler(method, cls, paramNames, uri);

            HandlerManager.getInstance().addMappingHandler(mappingHandler);
        }
    }
```
这样所有的请求映射处理器都被保存在 `HandlerManager` 的属性中了，我们在 WinterServlet 中遍历所有请求映射处理器查找能匹配当前请求 URI 的处理器，调用它的 `handler(ServletRequest req, ServletResponse res)` 方法就行。

```java
    @Override
    public void service(ServletRequest req, ServletResponse res) throws ServletException, IOException {
        for (MappingHandler handler : HandlerManager.getInstance().getMappingHandlerList()) {
            try {
                if (handler.handle(req, res)) {
                    return;
                }
            } catch (Exception e) {
                res.getWriter().println("Service Unavailable!!");
            }
        }
    }
```
#### 响应和序列化
接下来完善请求映射处理器的 handler 方法。

由于请求映射处理器中保存了处理一个请求所需要的所有信息，直接使用即可。

1. 使用 `ServletRequest.getParameter(String name)` 获取调用方法所需要的属性。
2. 使用 `ControllerClass.newInstance()` 实例化一个控制器类。
3. 调用 `Method.invoke(controller, args)` 获取请求映射处理器方法的返回值。
4. 使用 `jackson.ObjectMapper` 将返回值序列化成 json。
5. 将 json 结果写到 ServletResponse.writer 中，Tomcat 获取到 Servlet 后将其响应给客户端。

```java
    public boolean handle(ServletRequest req, ServletResponse res) {
        // 暂时使用全匹配
        if (!uri.equals(((HttpServletRequest) req).getRequestURI())) {
            return false;
        }

        Object[] args = new Object[argNames.length];
        for (int i = 0; i < argNames.length; i++) {
            args[i] = req.getParameter(argNames[i]);
        }

        Object controller = cls.newInstance();
        Object response = method.invoke(controller, args);

        ObjectWriter ow = new ObjectMapper().writer().withDefaultPrettyPrinter();
        String json = ow.writeValueAsString(response);

        res.getWriter().println(json);
        return true;
    }
```

## 小结
---
这样，一个最简易的 Spring MVC 就初具雏形了。

完善框架的过程中，对 Java 的一些基础知识有了更深刻的理解。

{{ site.article.summary }}