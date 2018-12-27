---
layout: post
title: "从应用到内核查接口超时（下）"
category: blog
tags: [kernel, ext4, file system]
date: 2018-10-20 13:00:06 +0800
comments: true
---

## 再启
---
接上文 <a href="{{ site.baseurl }}/2018/10/app_to_kernel_solve_api_timeout_2.html"> 从应用到内核查接口超时（中）</a>，查到是因为 journal 导致 write 系统调用被阻塞进而导致超时后，总感觉证据还不够充分，没有一个完美的交待。而且 leader 还想着让我把问题排查过程分享给同事们，这让我更加不安，担心搞错了方向。

在以往的博客中，我的问题结论总是确定的，如果是推论的话，我会显式注明。现在的情况让我有点犯难，推论说出去担心误导了别人，而内核层的事，我只知道基本理论，有关此问题的结论还没有。

于是，我只好再次踏上查这个问题的征程。

{{site.article.copyright}}

## 打印进程内核栈
---
回到问题的原点，对于此问题，我能确定的资料只有稳定复现的环境和不知道什么时候会触发 write system call 延迟的 jar 包。

考虑到 write system call 被阻塞可长达几百 ms，我想我能抓出当前进程的内核栈来看一下 write system call 此时被阻塞在什么位置。

具体步骤为：

1. 多个线程不便于抓内核栈，先将程序修改为单线程定量写入。
2. 使用 jar 包启动一个进程，使用 `ps` 拿到进程号。
3. 再通过 `top -H -p pid` 拿到占用 cpu、内存等资源最多的线程 ID，或使用 `strace` 启动，查看其输出里正在写入的线程 ID。
4. 使用 `watch` 命令搭配 `pstack` 或 `cat /proc/pid/stack` 不停打印进程内核栈。具体命令为 `watch -n 0.1 "date +%s >> stack.log;cat /proc/pid/stack >> stack.log"`
5. 找到 write system call 被阻塞时的时间戳，在 stack.log 里查看当时的进程内核栈。

可稳定收集到 write system call 被阻塞时，进程内核栈为：

```
	[<ffffffff812e31f4>] call_rwsem_down_read_failed+0x14/0x30
	[<ffffffffa0195854>] ext4_da_get_block_prep+0x1a4/0x4b0 [ext4]
	[<ffffffff811fbe17>] __block_write_begin+0x1a7/0x490
	[<ffffffffa019b71c>] ext4_da_write_begin+0x15c/0x340 [ext4]
	[<ffffffff8115685e>] generic_file_buffered_write+0x11e/0x290
	[<ffffffff811589c5>] __generic_file_aio_write+0x1d5/0x3e0
	[<ffffffff81158c2d>] generic_file_aio_write+0x5d/0xc0
	[<ffffffffa0190b75>] ext4_file_write+0xb5/0x460 [ext4]
	[<ffffffff811c64cd>] do_sync_write+0x8d/0xd0
	[<ffffffff811c6c6d>] vfs_write+0xbd/0x1e0
	[<ffffffff811c76b8>] SyS_write+0x58/0xb0
	[<ffffffff81614a29>] system_call_fastpath+0x16/0x1b
	[<ffffffffffffffff>] 0xffffffffffffffff
```

## 内核栈分析
---
#### write system call 阻塞位置
通过内核栈函数关键字找到了 OenHan 大神的博客，[读写信号量与实时进程阻塞挂死问题](http://oenhan.com/rwsem-realtime-task-hung) 这篇文章描述的问题虽然跟我遇到的问题不同，但进程内核栈的分析对我很有启发。为了便于分析内核函数，我 clone 了一份 linux 3.10.0 的源码，在本地查看。

搜索源码可以证实，栈顶的﻿汇编函数 `ENTRY call_rwsem_down_read_failed` 会调用 `rwsem_down_read_failed()`, 而此函数会一直阻塞在获取 inode 的锁。

```c
struct rw_semaphore __sched *rwsem_down_read_failed(struct rw_semaphore *sem) {
        .....
	/* wait to be given the lock */
	while (true) {
		set_task_state(tsk, TASK_UNINTERRUPTIBLE);
		if (!waiter.task)
			break;
		schedule();
	}

	tsk->state = TASK_RUNNING;

	return sem;
}

```

#### 延迟分配
知道了 write system call 阻塞的位置，还要查它会什么会阻塞在这里。这时，栈顶的函数名 `call_rwsem_down_read_failed` 让我觉得很奇怪，这不是 "write" system call 么，为什么会 `down_read_failed`？

直接搜索这个函数没有什么资料，但向栈底方向，再搜索其他函数就有了线索了，原来这是在做系统磁盘块的准备，于是就牵扯出了 ext4 的 delayed allocation 特性。

>延迟分配(delayed allocation)：ext4 文件系统在应用程序调用 write system call 时并不为缓存页面分配对应的物理磁盘块，当文件的缓存页面真正要被刷新至磁盘中时，才会为所有未分配物理磁盘块的页面缓存分配尽量连续的磁盘块。

这一特性，可以避免磁盘的碎片化，也可以避免存活时间极短文件的磁盘块分配，能很大提升系统文件 I/O 性能。

而在 write 向内存页时，就需要查询这些内存页是否已经分配了磁盘块，然后给未分配的脏页打上延迟分配的标签（写入的详细过程可以查看 [ext4 的延迟分配](https://blog.csdn.net/kai_ding/article/details/9914629)）。此时需要获取此 inode 的读锁，若出现锁冲突，write system call 便会 hang 住。

在挂载磁盘时使用 `-o nodelalloc` 选项禁用掉延迟分配特性后再进行测试，发现 write system call 被阻塞的情况确实消失了，证明问题确定跟延迟分配有关。

## 不算结论的结论
---
#### 寻找写锁
知道了 write system call 阻塞在获取读锁，那么一定是内核里有哪些地方持有了写锁。

`ipcs` 命令可以查看系统内核此时的进程间通信设施的状态，它打印的项目包括消息列表(-q)、共享内存(-m)和信号量(-q)的信息，用 `ipcs -q` 打印内核栈的函数查看 write system call 被阻塞时的信号量，却没有输出任何信息。
仔细想了一下发现其写锁 `i_data_sem` 是一把读写锁，而信号量是一种 `非0即1` 的PV量，虽然名字里带有 `sem`，可它并不是用信号量实现的。

`perf lock` 可以用来分析系统内核的锁信息，但要使用它需要重新编译内核，添加 `CONFIG_LOCKDEP、CONFIG_LOCK_STAT` 选项。先不说我们测试机的重启需要建提案等两天，编译完能不能启动得来我真的没有信心，第一次试图使用 `perf` 分析 linux 性能问题就这么折戟了。

#### 转变方法
问题又卡住了，这时我也没有太多办法了，现在开始研究 linux 文件系统源码是来不及了，但我还可以问。

在 stackOverflow 上问没人理我：[how metadata journal stalls write system call?](https://stackoverflow.com/questions/52778498/how-metadata-journal-stalls-write-system-call)， 追着 OenHan 问了几次也没有什么结论：[Linux内核写文件流程](http://oenhan.com/linux-kernel-write#comment-201)。

虽然自己没法测试 upstream linux，还是在 kernel bugzilla 上发了个帖子：[ext4 journal stalls write system call](https://bugzilla.kernel.org/show_bug.cgi?id=201461)。终于有内核大佬回复我：在 `ext4_map_blocks()` 函数中进行磁盘块分配时内核会持有写锁。

查看了源码里的函数详情，证实了这一结论：

```c
/*
 * The ext4_map_blocks() function tries to look up the requested blocks,
 * and returns if the blocks are already mapped.
 *
 * Otherwise it takes the write lock of the i_data_sem and allocate blocks
 * and store the allocated blocks in the result buffer head and mark it
 * mapped.
*/
int ext4_map_blocks(handle_t *handle, struct inode *inode,
		    struct ext4_map_blocks *map, int flags)
{
.....
	/*
	 * New blocks allocate and/or writing to uninitialized extent
	 * will possibly result in updating i_data, so we take
	 * the write lock of i_data_sem, and call get_blocks()
	 * with create == 1 flag.
	 */
	down_write((&EXT4_I(inode)->i_data_sem));
.....
}
```

但又是哪里引用了 `ext4_map_blocks()` 函数，长时间获取了写锁呢？再追问时大佬已经颇有些无奈了，linux 3.10.0 的 release 已经是 `5年` 前了，当时肯定也有一堆 bug 和缺陷，到现在已经发生了很大变动，追查这个问题可能并没有很大的意义了，我只好识趣停止了。

#### 推论
其实再向下查这个问题对我来说也没有太大意义了，缺少对源码理解的积累，再看太多的资料也没有什么收益。就如向建筑师向小孩子讲建筑设计，知道窗子要朝南，大门要靠近电梯这些知识并无意义，不了解建筑设计的原则，只专注于一些自己可以推导出来的理论点，根本没办法吸收到其中精髓。

那么只好走到最后一步，根据查到的资料和测试现象对问题原因做出推论，虽然没有直接证据，但肯定跟这些因素有关。

>﻿在 ext4 文件系统下，默认为 ordered journal 模式，所以写 metadata journal 可能会迫使脏页刷盘， 而在 ext4 启用 delayed allocation 特性时，脏页可能在落盘时发现没有分配对应的磁盘块而分配磁盘块。在脏页太多的情况下，分配磁盘块慢时会持有 inode 的写锁时间过长，阻塞了 write 系统调用。

## 小结
---
追求知识的每一步或多或少都有其中意义，查这个问题就陌使我读了很多外语文献，也了解了一部分文件系统设计思想。

linux 真的是博大精深，希望有一天我也能对此有所贡献。

{{site.article.summary}}