---
layout: post
title: "2018 年度代码报告"
category: blog
tags: [git, shell]
date: 2019-01-05 08:00:06 +0800
comments: true
---

昨天网易云音乐、B站等 APP 都放出了用户的 2018 年度使用报告，在朋友圈掀起了一股年度报告的热潮，我昨天在刷微博时看到"精分君"分享的《年度骂人报告》后，在被笑得眼泪都出来的同时，也在想我是不是也可以出一个《年度代码报告》呢？

{{ site.article.copyright }}

## 收集信息
---
得益于今年工作的稳定，所有本地代码仓库都老实地放在各个 jetBean 软件目录下，而且代码版本控制工具上，工作用 Gitlab，业余用 Github，都属于 git 系列，所有的提交记录都可以从 git log 里查询到，极大地方便了我收集信息。

#### git log
使用 `git log` 命令可以很方便地查看 git 的提交记录，我们在 git 目录下，不带任何参数使用 git log 命令时，会像平常使用  less 等命令时，进入一个内容浏览界面，在这里，我们可以翻页从前到后查看所有的 git 提交记录。使用 `>` 内容重定向符可以把 git log 重定向到指定的文件中，这时候我们看到的信息如下：

```
commit ee66af2de2e0b11bb9c987969916fcf486c25f1e
Author: zhenbianshu <zhenbianshu@foxmail.com>
Date:   Thu Dec 27 19:32:28 2018 +0800

    fix site base url;
```
可以看到，每一条提交记录都被拆分成了多行，而且如果 commit comment 有多行的话，日志会更不规则。git log 提供了 `--pretty` 参数可以帮助我们提取指定字段，并将它们集成到同一行。

pretty 参数的用法为 `git log --pretty="FORMAT"`，如我们常用的 printf 函数一样，可以在 FORMAT 中指定需要字段的占位符，各个字段对应的占位符都可以在 Git 官方文档中查找到，这里我只需要 `%h(短 hash)、%cd(完整提交时间)、%s(提交时的 comment)`。

此外，我们还可以通过 `--after` 各 `--before` 限制 git log 的时间范围，在多人合作的项目中，还需要使用 `--author` 限定提交的作者，最终完整的命令如下：

`git log --after="2018-01-01" --before="2019-01-01" --author="zhenbianshu" --no-merges --pretty=format:"%h | %cd | %s" >> /tmp/git.log`


#### 添加信息
通过 git log，我拿到像这样的提交信息：`81cb3a0bb | Fri Feb 9 10:25:12 2018 +0800 | fix bad smell;`，由于缺少项目和语言信息，还需要完善一下这些提交信息。

首先，在上一步，我将各个项目的 git log 都保存在 `项目.log` 的文件里了，一共有 20 个项目，意味着我去年向 20 个仓库贡献了代码。
但这些仓库使用的编程语言是没法自动识别的，我只好手动把这些仓库都放到 `编程语言` 文件夹内，最终的文件目录如下：
```
./C/rsync.log
./go/gotorch.log
./Java/story.log
./shell/video-simulation.log
...
```

接下来，再把各个文件的的路径名填充到各行后整合到一个文件就行了。

这里我使用了 `find、 xargs 和 awk` 命令，命令如下：

`find . -name "*.log" | xargs -I {} awk -v file="{}" '{print file,$0 }' {} >> /tmp/raw.log`

xargs 指定了 `{}` 作为 find 查到文件的替代符，然后使用 awk 的 `-v` 选项将文件名作为变量传入每一行。

## 分析
---
#### shell 命令
分析其实挺简单，就是把常用的 linux 命令揉合一下，无非是 `awk、grep、sort、uniq、wc` 等。

主要用到的命令选项是：

- `grep -e XX -e YY` 搜索包含 XX 或包含 YY 的行;
- `grep -E 'regex'` 按照正则搜索；
- `awk '{if(A){B}}'` awk 里的条件判断语句。
- `sort -f '*' -kn` 以 * 分隔每行后，按第 n 列排序；

#### 分析命令
贴两个所用的分析命令吧。

- 提交代码最多时段。

    我把一天的时间划分为四个时段： 0-6点凌晨、6-12点上午、12-18点午后、18-24点夜晚，对应命令是：
    `awk '{if($6>="00:00:00" && $6<"06:00:00"){print "凌晨"};if($6>="06:00:00" && $6<"12:00:00"){print "上午"};if($6>="12:00:00" && $6<"18:00:00"){print "午后"};if($6>="18:00:00" && $6<="23:59:59"){print "夜晚"};}' git.log | sort | uniq -c`
    结果是:

   ```
   5 凌晨
   296 上午
   679 午后
   346 夜晚
   ```
- 提交天数最多的项目。

    第二项是项目名，第五项是日期。
    `awk '{print $2,$5}' | sort | uniq | awk '{print $1}' | sort | uniq -c`

## 图片处理
---
数据分析出来之后，就是处理图片了。

我是在网易云音乐年度听歌报告的基础上改的（不用作商业，应该没问题吧，有问题请私我），所以需要一个像 Photoshop 一样的 P 图工具，在 Mac 上推荐用 `Pixelmator`，功能上跟 Photoshop 没什么区别，但软件大小才 100 多 M，比动辙 1G 多的 Photoshop 好多了。

软件工具上，主要用了补丁、文字、选区、裁剪、取色、倒色、图层等工具，之前有些 Ps 基础，用起来很简单。

## 成果
---
然后就是成果展示了，有些地方抹花了，凑合看吧~

<img width="50%" src="/images/2019/code_report_1.png" />
<img width="50%" src="/images/2019/code_report_2.png" />
<img width="50%" src="/images/2019/code_report_3.png" />
<img width="50%" src="/images/2019/code_report_4.png" />
<img width="50%" src="/images/2019/code_report_5.png" />
<img width="50%" src="/images/2019/code_report_6.png" />
<img width="50%" src="/images/2019/code_report_7.png" />
<img width="50%" src="/images/2019/code_report_8.png" />
<img width="50%" src="/images/2019/code_report_9.png" />

## 小结
---
做些有意思的事，代码写起来更欢快了呢~

另外，shell 用着真舒服~

{{ site.article.summary }}