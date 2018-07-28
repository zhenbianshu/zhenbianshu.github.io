---
layout: post
title: "用Lua定制Redis命令"
date: 2018-02-05 16:25:06 +0800
comments: true
---

## 前言
---
Redis作为一个非常成功的数据库，提供了非常丰富的数据类型和命令，使用这些，我们可以轻易而高效地完成很多缓存操作，可是总有一些比较特殊问题或需求需要解决，这时候可能就需要我们自己定制自己的 Redis 数据结构和命令。

{{ site.article.copyright }}

## Redis命令问题
---
#### "线程安全"问题
我们都知道 Redis 是单线程的，可是它怎么会有 [线程安全](https://zh.wikipedia.org/wiki/%E7%BA%BF%E7%A8%8B%E5%AE%89%E5%85%A8) 问题呢？

我们正常理解的线程安全问题是指`单进程多线程`模型内部多个线程`操作进程内共享内存`导致的数据资源充突。而 Redis 的线程安全问题的产生，并不是来自于 Redis 服务器内部。

Redis 作为数据服务器，就相当于多个客户端的共享内存，多个客户端就相当于同一进程下的多个线程，如果多个客户端之间没有良好的数据同步策略，就会产生类似线程安全的问题。

典型场景是：

- Redis 内存储了一个用户的状态： `user5277=idle`；
- 客户端连接 A 读取了用户状态，获取到用户的空闲状态 `status = get("user5277")`；
- 客户端连接 B 也同样读取了用户状态；
- 客户端连接 A 给用户安排了一个任务，并将 Redis 内用户状态置为忙碌 `set("user5277", "busy")`；
- 客户端连接 B 同样设置用户为忙碌状态。
- 可是此时用户却被同时分配了两个任务。

导致这个问题的原因就是虽然 Redis 是单线程的，能保证命令的序列化，但由于其执行效率很高，多个客户端的命令之间不做好请求同步，同样会造成命令的顺序错乱。

当然这个问题也很好解决，给用户状态加锁就行了，使同一时间内只能有一个客户端操作用户状态。不过加锁我们就需要考虑锁粒度、死锁等问题了，无疑添加了程序的复杂性，不利于维护。

#### 效率问题
Redis 作为一个极其高效的内存数据服务器，其命令执行速度极快，之前看过阿里云 Redis 的一个压测结果，执行效率可以达到 10W写QPS， 60W读QPS，那么，它的效率问题又来自何处呢？

答案是网络，做 Web 的都知道，效率优化要从网络做起，服务端又是优化代码，又是优化数据库，不如网络连接的一次优化，而网络优化最有效的就是减少请求数。我们要知道执行一次内存访问的耗时约是 `100ns`，而不同机房之间来回一次约需要 `500000ns`，其中的差距可想而知。

Redis在单机内效率超高，但工业化部署总不会把服务器和 Redis 放在同一台机器上，如果触碰到效率瓶颈的话，那就是网络。

典型场景就是我们从 Redis 里读出一条数据，再使用这条数据做键，读取另外一条数据。这样来来回回，便有两次网络往返。

导致这种问题的原因就是 Redis 的普通命令没有服务端计算的能力，无法在服务器进行复合命令操作，虽然有 Redis 也提供了 `pipeline` 的特性，但它需要多个命令的请求和响应之间没有依赖关系。想简化多个相互依赖的命令就只能将数据拉回客户端，由客户端处理后再请求 Redis。

综上，我们要更高效更方便的使用 Redis 就需要自己“定制”一些命令了。


## 内嵌Lua的执行
---
万幸 Redis 内嵌了 Lua 执行环境，支持 Lua 脚本的执行，通过执行 Lua 脚本，我们可以把多个命令复合为一个 Lua 脚本，通过 Lua 脚本来实现上文中提到的 Redis 命令的次序性和 Redis 服务端计算。

#### Lua
[Lua](https://zh.wikipedia.org/wiki/Lua) 是一个简洁、轻量、可扩展的脚本语言，它的特性有：

- 轻量：源码包只有核心库，编译后体积很小。
- 高效：由 ANSI C 写的，启动快、运行快。
- 内嵌：可内嵌到各种编程语言或系统中运行，提升静态语言的灵活性。如 OpenResty 就是将 Lua 嵌入到 nginx 中执行。

而且完全不需要担心语法问题，Lua 的语法很简单，分分钟使用不成问题。

#### 执行步骤
Redis 在 2.6 版本后，启动时会创建 Lua 环境、载入 Lua 库、定义 Redis 全局表格、存储 `redis.pcall` 等 Redis 命令，以准备 Lua 脚本的执行。

一个典型的 Lua 脚本执行步骤如下：

1. 检查脚本是否执行过，没执行过使用脚本的 sha1 校验和生成一个 Lua 函数；
2. 为函数绑定超时、错误处理勾子；
3. 创建一个伪客户端，通过这个伪客户端执行 Lua 中的 Redis 命令；
4. 处理伪客户端的返回值，最终返回给客户端；

<img src="/images/2018/lua_order.png">

虽然 Lua 脚本使用的是伪客户端，但 Redis 处理它会跟普通客户端一样，也会将执行的 Redis 命令进行 rdb aof 主从复制等操作。

#### 使用
Lua 脚本的使用可以通过 Redis 的 `EVAL` 和 `EVALSHA` 命令。

`EVAL` 适用于单次执行 Lua 脚本，执行脚本前会由脚本内容生成 sha1 校验和，在函数表内查询函数是否已定义，如未定义执行成功后 Redis 会在全局表里缓存这个脚本的校验和为函数名，后续再次执行此命令就不会再创建新的函数了。

而要使用 `EVALSHA` 命令，就得先使用 `SCRIPT LOAD` 命令先将函数加载到 Redis，Redis 会返回此函数的 sha1 校验和， 后续就可以直接使用这个校验和来执行命令了。

以下是使用上述命令的例子：

``` shell
127.0.0.1:6379> EVAL "return 'hello'" 0 0
"hello"

127.0.0.1:6379> SCRIPT LOAD "return redis.pcall('GET', ARGV[1])"
"20b602dcc1bb4ba8fca6b74ab364c05c58161a0a"

127.0.0.1:6379> EVALSHA 20b602dcc1bb4ba8fca6b74ab364c05c58161a0a 0 test
"zbs"
```

EVAL 命令的原型是 `EVAL script numkeys key [key ...] arg [arg ...]`，在 Lua 函数内部可以使用 `KEYS[N]` 和 `ARGV[N]` 引用键和参数，需要注意 KEYS 和 ARGV 的参数序号都是从 `1` 开始的。

还需要注意在 Lua 脚本中，Redis 返回为空时，结果是 `false`，而 `不是 nil`；

## Lua 脚本实例
---
下面写几个 Lua 脚本的实例，用来介绍语法的，仅供参考。

- Redis 里 hashSet A 的 字段 B 的值是 C，取出 Redis 里键为 C 的值。

```lua
// 使用: EVAL script 2 A B

local tmpKey = redis.call('HGET', KEYS[1], KEYS[2]);
return redis.call('GET', tmpKey);
```
- 一次 lpop 出多个值，直到值为 n，或 list 为空（pipeline 也可轻易实现）；

```lua
// 使用: EVAL script 2 list count

local list = {};
local item = false;
local num = tonumber(KEYS[2]);
while (num > 0)
do
    item = redis.call('LPOP', KEYS[1]);
    if item == false then
        break;
    end;
    table.insert(list, item);
    num = num - 1;
end;
return list;
```
- 获取 zset 内 score 最多的 n 个元素 对应 hashset 中的详细信息；

```lua
local elements = redis.call('ZRANK', KEYS[1], 0, KEY[2]);
local detail = {};

for index,ele in elements do
	local info = redis.call('HGETALL', ele);
	table.insert(detail, info);
end;

return detail;

```

基本使用语法就是如此，更多应用就看各个具体场景了。

## 一些思考
---
实现之外，还要一些东西要思考：

#### 使用场景
首先来总结一下 Redis 中 Lua 的使用场景：

- 可以使用 Lua 脚本实现原子性操作，避免不同客户端访问 Redis 服务器造成的数据冲突。
- 在前后多次请求的结果有依赖时，可以使用 Lua 脚本把多个请求整合为一个请求。

#### 注意点
使用 Lua 脚本，我们还需要注意：

- 要保证安全性，在 Lua 脚本中不要使用全局变量，以免污染 Lua 环境，虽然使用全局变量全报错，Lua 脚本停止执行，但还是在定义变量时添加 `local` 关键字。
- 要注意 Lua 脚本的时间复杂度，Redis 的单线程同样会阻塞在 Lua 脚本的执行中。
- 使用 Lua 脚本实现原子操作时，要注意如果 Lua 脚本报错，之前的命令同样无法回滚。
- 一次发出多个 Redis 请求，但请求前后无依赖时，使用 `pipeline`，比 Lua 脚本方便。

## 小结
---
最近工作有了较大的变动，从业务到技术栈都跟原来完全不同了，所有代码和业务都脱离了自己掌控的感觉真的很不爽，工作中全是“开局一个搜索引擎，语法全靠查”，每天还要熬到很晚熟悉新的东西，有点小累，果然换工作就是找罪受啊。不过走出舒适区后的充实感也在提醒自己正在不停进步，倒也挺有成就感的。

刚接触新的东西没啥沉淀，又不想写一些《带你三天精通 Java》这种水文，工作之余的时间都被拿去补充工作需要的技术栈了，也没时间研究些自己觉得有意思的东西，写文章需要素材啊，为了不自砸招牌，最近可能会少更。。

{{ site.article.summary }}

参考：

[Redis 设计与实现 » Lua 脚本](http://redisbook.readthedocs.io/en/latest/feature/scripting.html)

[Redis 与 Lua 脚本](http://wiki.jikexueyuan.com/project/redis/Lua.html)

[Redis的Lua脚本编程的实现和应用](https://www.jianshu.com/p/9e7b5c5c9b7b)

