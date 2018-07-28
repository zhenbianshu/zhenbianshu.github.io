---
layout: post
title: "JavaScript Alert函数执行顺序问题"
date: 2018-04-02 16:25:06 +0800
comments: true
---

文章简单地介绍了 javaScript 的 alert 函数在遇到异步代码时的执行顺序问题，分析了问题导致的原因，并提出替换 alert 和 使用 setTimeout 转异步两种解决方案。
## 问题
---
前几天使用 JavaScript 写 HTML 页面时遇到了一个奇怪的问题：

我想实现的功能是通过 `confirm()` 弹窗让用户选择不同的需求，每次选择后都将选择结果暂时输出到页面上，最后一次选择结束后再一次性将选项传到后端处理。
代码类似于：

```javascript
    var step1 = confirm("exec step1?");
    $('#result').html($('#result').html() + "\n" + step1);
    var step2 = confirm("exec step2?");
    $('#result').html($('#result').html() + "\n" + step2);
    var step3 = confirm("exec step3?");
    $('#result').html($('#result').html() + "\n" + step3);

    send(step1, step2, step3);
```

可是代码运行后却发现：每次在执行完 confirm 函数，用户选择选项之后，页面并没有刷新，step1, step2 的结果没有实时刷新到页面上，而是到最后一步跟 step3 一块显示了出来。

后续尝试了 `alert()` 和 `prompt()` 这两个跟 confirm 类似的弹对话框函数，情况都与此相同，它们都会跳过页面渲染先被执行。

此时，还有更诡异的情况，我们给某一个 div 里赋值后，立刻 alert 此 div 里的内容，会发现 alert 显示正确的内容，而 div 里的内容却没有更新，并且会一直阻塞到我们点击确定。

如图：
<img src="/images/2018/js_alert.png">

alert、prompt、confirm 三个函数都类似，接下来我们就用最简单的 alert 来说。

{{ site.article.copyright }}

## 分析
---
解决这个问题之前先了解一下它是怎么导致的，而要了解它需要从 JavaScript 的线程模型说起。

JavaScript 引擎是单线程运行的，浏览器无论在什么时候都只且只有一个线程在运行 JavaScript 程序，初衷是为了减少 DOM 等共享资源的冲突。可是单线程永远会面临着一个问题，那就是某一段代码阻塞会导致后续所有的任务都延迟。又由于 JavaScript 经常需要操作页面 DOM 和发送 HTTP 请求，这些 I/O 操作耗时一般都比较长，一旦阻塞，就会给用户非常差的使用体验。

于是便有了事件循环（event loop）的产生，JavaScript 将一些异步操作或 有I/O 阻塞的操作全都放到一个事件队列，先顺序执行同步 CPU代码，等到 JavaScript 引擎没有同步代码，CPU 空闲下来再读取事件队列的异步事件来`依次`执行。

这些事件包括：

- `setTimeout()` 设置的异步延迟事件；
- DOM 操作相关如布局和绘制事件；
- 网络 I/O 如 AJAX 请求事件；
- 用户操作事件，如鼠标点击、键盘敲击。

## 解决
---
明白了原理， 再解决这个问题就有了方向，我们来分析这个问题：

1. 由于页面渲染是 DOM 操作，会被 JavaScript 引擎放入事件队列；
2. `alert()` 是 window 的内置函数，被认为是同步 CPU代码；
3. JavaScript 引擎会优先执行同步代码，alert 弹窗先出现；
4. alert 有特殊的阻塞性质，JavaScript 引擎的执行被阻塞住；
5. 点击 alert 的“确定”，JavaScript 没有了阻塞，执行完同步代码后，又读取事件队列里的 DOM 操作，页面渲染完成。


由上述原因，导致了诡异的 “Alert执行顺序问题”。
我们无法将页面渲染变成同步操作，那么只好把 `alert()` 变为异步代码，从而才能在页面渲染之后执行。

对于这个解决方向，我们有两种方法可以使用：

#### 替换 Alert() 函数
首先我们考虑替换掉 alert 函数的功能。其实大多数情况下我们替换掉 alert 并不是它不符合我们期待的执行顺序，而是因为它实在是太丑了，而且也不支持各种美化，可以想像在一个某一特定主题的网站上忽然弹出来一个灰色单调的对话框是多么不和谐。

这个我们可以考虑 Bootstrap 的 modal 模块，Bootstrap 在绝大多数网站上都在应用，而多引入一个 modal 模块也不会有多大影响。我们使用 modal 构造一个弹出对话框的样子，使用 modal 的 `modal('toggle')/modal('show')/modal('hide')` 方法可以很方便地控制 modal 的显隐。

替换掉对话框后，我们还需要解决后续代码执行的问题。使用 alert 函数时，我们点击确定后代码还会继续执行，而使用我们自定义的对话框可没有这种功能了，需要考虑把后续代码绑定在对话框的点击按钮上，这就需要使用 DOM 的 `onclick` 属性了，我们将后续函数内容抽出一个新的函数，在弹出对话框后将这个函数绑定在按钮的 onclick 事件上即可。

这里还需要注意，新函数内应该包括关闭 modal 对话框的内容。

当然，我们还可以再优化一下，抽象出来一个用来弹出对话框的函数替代 alert 函数，示例如下：

```javascript
window.alert = function (message, callbackFunc) {
    $('#alertContent').html(message);
    $('#modal').show();
    $('#confirmButton').onclick(function () {
        $('#modal').hide();
        callbackFunc();
    });
};
```
如此，我们在需要弹出框时调用新的 alert 函数，并传入 callbackFunc ，在里面做后续的事情就可以了。

#### setTimeOut函数
当然，并不是所有人都愿意使用新的对话框替换 alert 函数的对话框，总感觉上面的方法不是特别的优雅，对此，我们可以采用另外的方法解决这个问题。

前端的同学应该对 `setTimeout()` 这个函数不陌生，使用它，可以延迟执行某些代码。而对于延迟执行的代码，JavaScript 引擎总是把这些代码放到事件队列里去，再去检查是否已经到了执行时间，再适时执行。代码进入事件队列，就意味着代码变成和页面渲染事件一样异步了。由于事件队列是`有序`的，我们如果用 setTimeout 延时执行，就可以实现在页面渲染之后执行 alert 的功能了。

setTimeout 的函数原型为 `setTimeout(code, msec)`，code 是要变为异步的代码或函数，msec 是要延时的时间，单位为毫秒。这里我们不需要它延时，只需要它变为异步就行了，所以可以将 msec 设置为 0；

同样，alert 之后的代码我们也需要处理，将它们跟 alert 一块放到 setTimeout 里异步执行。这样，代码就变为 `setTimeout("alert('msg');doSomething();", 0);`，如果觉得代码不够美观或字符串不好处理的话，可以将后续代码封装成一个函数放到 `doSomething()` 里即可。

## 小结
---
在上面的两个解决方案中，都利用了 JavaScript 的回调函数，前者将函数所为 alert 的参数并绑定到 DOM 的 onclick 事件，后者使用 setTimeout 将函数转为异步执行。JavaScript 的回调函数确实非常强大，使用起来也很简单，但是却有一个隐含的问题，就是回调嵌套问题，单层的回调很容易理解，但如果要实现像我的需求一样，有多个 alert 和页面渲染轮流执行的情况，需要面临的可能就是“回调地狱”， onclick 事件绑定里的函数又要嵌套绑定 onclick 函数， setTimeout 里还需要另一个 setTimeout 语句，一旦出现问题，排查起来就比较麻烦了。

前端写得不多，可能对 JavaScript 的理解会有些偏差，文章如有错漏，还请在文章下面评论区指出。对于此问题，如果有大神有更好的解决方案，还请不吝赐教。

{{ site.article.summary }}
