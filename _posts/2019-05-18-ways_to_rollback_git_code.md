---
layout: post
title: "Git 如何优雅地回退代码"
category: blog
tags: [Git]
date: 2019-05-18 08:00:06 +0800
comments: true
---

## 前言
---
从接触编程就开始使用 Git 进行代码管理，先是自己玩 Github，又在工作中使用 Gitlab，虽然使用时间挺长，可是也只进行一些常用操作，如推拉代码、提交、合并等，更复杂的操作没有使用过，看过的教程也逐渐淡忘了，有些对不起 Linus 大神。

出来混总是要还的，前些天就遇到了 Git 里一种十分糟心的场景，并为之前没有深入理解 Git 命令付出了一下午时间的代价。

先介绍一下这种场景，我们一个项目从 N 版本升到 A 版本时引入了另一项目的 jar 包，又陆续发布了 B、C 版本，但在 C 版本后忽然发现了 A 版本引入的 jar 包有极大的性能问题，B、C 版本都是基于 A 版本发布的，要修复 jar 包性能问题，等 jar 包再发版还得几天，可此时线上又有紧急的 Bug 要修，于是就陷入了进退两难的境地。

最后决定先将代码回退到 A 版本之前，再基于旧版本修复 Bug，也就开始了五个小时的受苦之路。

{{ site.article.copyright }}

## 普通方式
---
#### revert
首先肯定的是 revert，`git revert commit_id` 能产生一个 与 commit_id 完全相反的提交，即 commit_id 里是添加， revert 提交里就是删除。

但是使用 git log 查看了提交记录后，我就打消了这种想法，因为提交次数太多了，中途还有几次从其他分支的 merge 操作。"利益于"我们不太干净的提交记录，要完成从 C 版本到 N 版本的 revert，我需要倒序执行 revert 操作几十次，如果其中顺序错了一次，最终结果可能就是不对的。

另外我们知道我们在进行代码 merge 时，也会把 merge 信息产生一次新的提交，而 revert 这次 merge commit 时需要指定 m 参数，以指定 `mainline`，这个 mainline 是主线，也是我们要保留代码的主分支，从 feature 分支往 develop 分支合并，或由 develop 分支合并到 master 的提交还好确定，但 feature 分支互相合并时，我哪知道哪个是主线啊。

所以 revert 的文案被废弃了。

#### Reset
然后就考虑 `reset` 了， reset 也能使代码回到某次提交，但跟 revert 不同的是， reset 是将提交的 HEAD 指针指到某次提交，之后的提交记录会消失，就像从没有过这么一次提交。

但由于我们都在 feature 分支开发，我在 feature 分支上将代码回退到某次提交后，将其合并到 develop 分支时却被提示报错。这是因为 feature 分支回退了提交后，在 git 的 workflow 里，feature 分支是落后于 develop 分支的，而合并向 develop 分支，又需要和 develop 分支保持最新的同步，需要将 develop 分支的数据合并到 feature 分支上，而合并后，原来被 reset 的代码又回来了。

这个时候另一个可选项是在 master 分支上执行 reset，使用 `--hard` 选项完全抛弃这些旧代码，reset 后再强制推到远端。

```
master> git reset --hard commit_id
master> git push --force origin master
```
但是还是有问题，首先，我们的 master 分支在 gitlab 里是被保护的，不能使用 force push，毕竟风险挺大了，万一有人 reset 到最开始的提交再强制 push 的话，虽然可以使用 `reflog` 恢复，但也是一番折腾。

另外，reset 毕竟太野蛮，我们还是想能保留提交历史，以后排查问题也可以参考。

## 升级方式
---
#### rebase
只好用搜索引擎继续搜索，看到有人提出可以先使用 `rebase` 把多个提交合并成一个提交，再使用 revert 产生一次反提交。


#### 文件操作

#### rebase 的正确姿势

## 小结
---

{{ site.article.summary }}
