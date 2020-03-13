---
layout: post
title: "使用状态机解决多状态问题"
date: 2020-03-10 10:00:06 +0800
category: blog
tags: [Algorithm, FSM]
comments: true

---
## 背景
---
接上文[玩转 Java 动态编译]({{ site.baseurl }}/2019/12/play_with_java_dynamic_compile.html)，实现了 Java 代码的动态编译后，接下来就要填补上文中提到的坑，将原来使用注释配置的 Java 数据类型改为使用缩写替代。

为了便于缩写，能直观地看出完整类型，我设计的方案是：

1. 对简单类型如 String、int、Double，就使用类型的首字母替代，如 `i -> int / D -> Double`；
2. 对于容器类型如 List、Map，使用两个首字母分别标志容器的开始和闭合，如 `LDL -> List<Double> /  MDDM -> Map<Double,Double>`；
3. 由于 Set 的首字母和 String 首字母冲突，将 String 的缩写修改为 T，同时处理了 Long 和 List 的冲突；
4. 支持容器类型的嵌套，如 `LLTLL -> List<List<String>>  /  MTLDLM -> Map<String,List<Double>>`；

我使用普通的 if-else 方式和状态机方式各实现了一遍，更深切地理解了状态机在处理这种多状态的复杂问题时的优越性，两种实现的代码我都放在了 github 上，地址是： [Github-zhenbianshu-java_shorten_type_parser](https://github.com/zhenbianshu/java-shorten-type-parser)，有类似需求的可以改改来用。

{{ site.article.copyright }}

## IF-ELSE 方式
---
原来以为写一个简单的类型翻译器花不了太多时间，可是真做起来，才发现要注意的点太多了。

首先是处理容器的开启和闭合，这就需要使用`栈`来保存预期的下一个字符类型，再对比栈顶字符类型和当前处理字符，决定解析的结果。还要注意类型嵌套的情况下，内层嵌套的容器作为外层容器的元素被解析完成时，需要修改外层容器的预期字符。而且 Map 作为一种相对 Set 和 List 比较特殊的容器，还要处理它的左右元素。同时还不能忘记处理各种异常，如未知字符、容器内是原始类型、容器未正确闭合等。

而这些逻辑混杂在一块就更添复杂度了，通常是一遍代码写下来挺顺畅，找几个特殊的 case 一验证，往往就有没有考虑到的点，你以为解决了这个点就好了，殊不知这个问题点的解决方案又引起了另一个问题。

最终修修补补好多次，终于把代码写完了，连优化的想法都没了，担心又引入新的问题。

最终的伪代码如下：

```java
    public String parseToFullType() throws IllegalStateException {
        StringBuilder sb = new StringBuilder();

        for (; ; this.scanner.next()) {
            Character currentChar = scanner.current();
            if (currentChar == '\uFFFF') {
                return sb.toString();
            }
            if (isCollection()) {
                if (CollectionEnd()) {
                    dealCollectionEleEnd();
                }else {
                    throw new IllegalStateException("unexpected char '" + currentChar + "' at position " + scanner.getIndex());
                }
            } else if (isWrapperType()) {
                dealSingleEleEnd();
            } else if (parseStart()) {
                if (collectionStart()) {
                    putCollecitonExpectEle()
                }
            } else {
                throw new IllegalStateException("unknown char '" + currentChar + "' at position " + scanner.getIndex());
            }
        }
    
```

## 状态机方式
---
是不是看起来非常乱，这还没有列出各个方法里的条件判断语句呢。这么多逻辑混杂，造成的问题就是很难改动，因为你不知道改动会影响哪些其他逻辑。面对这种问题，当然有一套被反复使用、多数人知晓的、经过分类编目的、代码设计经验的总结，就是`状态机`。

#### 状态机
>有限状态机（finite-state machine，缩写：FSM）又称有限状态自动机（finite-state automation，缩写：FSA），简称状态机，是表示有限个状态以及在这些状态之间的转移和动作等行为的数学计算模型。


像我们生活中在公路上驾驶汽车就像在维护一个状态机，遇到红灯就停车喝口水，红灯过后再继续行车，遇到了黄灯就要减速慢行。而实现状态机前要首先明确四个主体：

- 状态 State：状态是一个系统在其生命周期的某一刻时的运行状态，如驾车的例子中状态就包括 正常速度行驶、停车和低速行驶三种状态。
- 事件 Event：事件就是某一时刻施加于系统的某个信号，在上面的例子中事件是指红灯、绿灯和黄灯。所有的状态变化都要依赖事件，但事件也可能导致状态不发生变化，如正常行驶中遇到绿灯就不用做什么反应。
- 变换 Transition：变换是在事件发生之后系统要做出的状态变化，如上面例子中的减速、停车或加速。
- 动作 Action：动作是同样是事件发生之后系统做出的反应，不同的是，动作不会改变系统状态，像驾车遇到红灯停车后，喝水这个动作没有对系统状态造成影响。

将状态机的四种要素提取之后，就可以很简单地将状态和事件进行解耦了。

#### 状态拆分
还是拿我的这个需求来分析，先画出状态变化图从整体上把握状态间的关系。

<img src="/images/2020/fsm_state.png" />

通过上面的图一步步拆解状态机：

1. 首先是确定状态，我定义了 Start/SetStart/SetEle/ListStart/ListEel/MapStart/MapLeft/MapRight 八种基础状态，由于一次只解析一个类型，容器闭合就代表着解析结束，所以没有对各个容器设置结束状态。又因为有状态嵌套的存在，而一个状态没法表达状态机的准确状态，需要使用栈来存储整体的解析状态，我使用这个栈为空来代表 End 状态，又省略了一个状态。
    
2. 再拆分事件，事件是扫描到的每一个字符，由于字符种类较多，而像 integer 和 double、String 和 Long 的处理又没有什么区别，我将事件类型抽象为 包装类型元素(WRAPPED_ELE)，原始类型元素(PRIMITIVE_ELE)，MAP、List 和 Set 五种。

3. 变幻和动作都是事件发生后系统的反应，在我的需要里需要转变解析状态，并将结构结果保存起来。这里我将它们整体抽象为一个事件处理器接口，如：
    
   ```java
    public interface StateHandler {
        /**
         * @param event 要处理的事件
         * @param states 系统整体状态
         * @param result 解析的结果
         */
        void handle(Event event, Stack<State> states, StringBuilder result);
    }
    ```

#### 代码示例
将状态机的各个要素都抽出来之后，再分别完善每个 StateHandler 的处理逻辑就行，这部分就非常简单了，下面是 MapLeftHandler 的详情。

```java
public class MapLeftHandler implements StateHandler {
    @Override
    public void handle(Event event, Stack<State> states, StringBuilder result) {
        // 这里是核心的 Action，将单步解析结果放到最终结果内
        result.append(",");
        result.append(event.getParsedVal());

        // 状态机的典型处理方式，处理各种事件发生在当前状态时的逻辑
        switch (event.getEventType()) {
            case MAP:
                states.push(State.MAP_START);
                break;
            case SET:
                states.push(State.SET_START);
                break;
            case LIST:
                states.push(State.LIST_START);
                break;
            case WRAPPED_ELE:
                // 使用 pop 或 push 修改栈顶状态来修改解析器的整体状态
                states.pop();
                states.push(State.MAP_RIGHT);
                break;
            case PRIMITIVE_ELE:
                // 当前状态不能接受的事件类型要抛异常中断
                throw new IllegalStateException("unexpected primitive char '" + event.getCharacter() + "' at position " + event.getIndex());
            default:
        }
    }
}
```

主类内的代码如下：

```java
    public static String parseToFullType(String shortenType) throws IllegalStateException {
        StringBuilder result = new StringBuilder();
        StringCharacterIterator scanner = new StringCharacterIterator(shortenType);
        Stack<State> states = new Stack<>();
        states.push(State.START);

        for (; ; scanner.next()) {
            char currentChar = scanner.current();
            if (currentChar == '\uFFFF') {
                return result.toString();
            }
            // 使用整体状态为空来代表解析结束
            if (states.isEmpty()) {
                throw new IllegalStateException("unexpected char '" + currentChar + "' at position " + scanner.getIndex());
            }
            // 将字符规整成事件对象，有利于参数的传递
            Event event = Event.parseToEvent(currentChar, scanner.getIndex());
            if (event == null) {
                throw new IllegalStateException("unknown char '" + currentChar + "' at position " + scanner.getIndex());
            }
            
            // 这里需要一个 Map 来映射状态和状态处理器
            STATE_TO_HANDLER_MAPPING.get(states.peek()).handle(event, states, result);
        }
    }

```

## 小结
---
#### 状态模式
如果你对设计模式较熟的话，会发现这不就是状态模式嘛。有解释说，状态模式会将事件类型也再解耦，即 StateHandler 里不只有一个方法，而是会有八个方法，分别为 handleStart,HandleListEle 等，但我觉得模式并不是定式，稍微的变形是没有问题的，如果单个事件类型的处理足够复杂，将其再拆分更合理一些。

#### 代码结构
最后，对比 if-else 实现，从代码量上来看，状态机实现增加了很多，这是解耦的代价，当然也有很多重复代码的缘故，比如在容器闭合时校验当前容器是否内嵌容器，并针对内嵌容器做处理的逻辑就完全一样，为了代码清晰我就没有再抽取方法。

从可维护性上来说，状态机实现由于逻辑拆分比较清晰，在添加或删除一种状态时比较方便，添加一个状态和状态处理器就行，但在添加一种事件类型时较为复杂，需要修改所有状态处理器里的实现，不过从整体上来看是利大于弊的，毕竟代码清晰易改动最重要。

了解了状态机实现的固定套路之后，你也可以写出高大上的状态机代码了，快 Get 起来替换掉项目里杂乱的 if-else 吧。

{{ site.article.summary }}