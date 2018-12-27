---
layout: post
title: "使用 shell 在多服务器上批量操作"
category: blog
tags: [ssh, Linux, OPS，shell]
date: 2018-12-22 13:00:06 +0800
comments: true
---
## 需求
---
日常工作中，我们常需要同时在多台服务器上执行同样的命令，如对比日志、检查服务等。这就需要我们有服务器批量操作的能力。

两年前写过一篇文章，[shell实现SSH自动登陆](/2016/09/shell_ssh_auto_login.html) 使用 shell 的 `expect` 命令进行 ssh 登陆，这种方式的灵活性确实非常高，但实现起来比较麻烦，而且单进程阻塞的特性也是它的硬伤，如果使用它进行批量操作，就需要启动多个 expect 进程，涉及到各个进程和主进程的双向通信，处理起来非常麻烦。

不过我们可以借用 ssh `公钥登陆` 的能力，方便地实现在多个服务器上批量执行命令。

{{ site.article.copyright }}

## SSH 协议
---
说公钥登陆之前，先来说一下 SSH 协议。

SSH 是一种网络协议，我们常说的 ssh 一般指其实现，即 OpenSSH，在 shell 中，也就是 ssh 命令。

#### SSH
> Secure Shell（安全外壳协议，简称SSH）是一种加密的网络传输协议，可在不安全的网络中为网络服务提供安全的传输环境。 SSH通过在网络中建立安全隧道来实现SSH客户端与服务器之间的连接。

SSH 的原理跟 HTTPS 差不多，都是基于 TCP 和 非对称加密进行的应用层协议。它跟 HTTPS 的不同之处在于 HTTPS 通过 `数字证书` 和 `数字证书认证中心` 来防止中间人攻击，而 ssh 服务器的公钥没有人公证，只能通过其公钥指纹来人工确定其身份。

如下图所示，我们第一次使用 ssh 登陆某台服务器时， ssh 会提示我们验证服务器的公钥指纹。

<img src="/images/2018/ssh_fingerprint.png" />

当我们验证此公钥指纹是我们要登陆的服务器后，服务器的公钥会被添加到 `~/.ssh/known_hosts` 里，再登陆时，ssh 检测到是已认证服务器后就会跳过公钥验证阶段。

#### 建连过程
关于通信加密的概念，我在之前的文章也有所介绍，参见：[再谈加密-RSA非对称加密的理解和使用]({{ site.baseurl }}/2017/01/understand_and_use_rsa.html)。至于 SSH 协议的建连过程，则可以参阅：[Protocol Basics: Secure Shell Protocol ](https://www.cisco.com/c/en/us/about/press/internet-protocol-journal/back-issues/table-contents-46/124-ssh.html)。

总结起来主要包括以下步骤：

- TCP 三次握手
- SSH 协议版本协商
- 客户端与服务端的公钥交换
- 加密算法协商
- 客户端使用对称加密的密钥认证
- 客户端与服务端安全通信

我使用 tcpdump + wireshark 抓包并查看了一下其 SSH 的建连过程，如下图所示：

<img src="/images/2018/ssh_protocol.png" />

不得不再次感叹 tcpdump + wireshark 是学习网络协议的真神器。

## ssh 工具
---
#### ssh
作为工具， ssh 分为服务端和客户端，在服务端，它是 `sshd`，一般占用 22 端口。我们平常使用的是其客户端，一般用法为 `ssh user@host`，然后根据 ssh 的提示，我们输入密码后登陆到服务器。

它的功能非常强大，看其支持参数就知道了。

```shell
ssh [-1246AaCfGgKkMNnqsTtVvXxYy] [-b bind_address] [-c cipher_spec] [-D [bind_address:]port] [-E log_file] [-e escape_char] [-F configfile] [-I pkcs11] [-i identity_file] [-J [user@]host[:port]] [-L address] [-l login_name] [-m mac_spec] [-O ctl_cmd] [-o option] [-p port] [-Q query_option] [-R address] [-S ctl_path] [-W host:port] [-w local_tun[:remote_tun]] [user@]hostname [command]
```

介绍完了 SSH 协议和 ssh 命令，终于说到公钥登陆了。
#### 公钥登陆
理解了非对称加密的原理后，再公钥登陆会非常简单。由于公私钥是唯一的一对，在客户端保障自己私钥安全的情况下，服务端通过公钥就可以完全确定客户端的真实性，所以要实现公钥登陆，我们就要先生成一个公私密钥对。

通过 `ssh-keygen` 命令来生成密钥对，为了让步骤更完整，我把它们暂时保存到工作目录，默认会保存到 `~/.ssh` 目录。

```shell
~ ssh-keygen
Generating public/private rsa key pair.
Enter file in which to save the key (/Users/zbs/.ssh/id_rsa): ./test
Enter passphrase (empty for no passphrase):
Enter same passphrase again:
Your identification has been saved in ./test.
Your public key has been saved in ./test.pub.
The key fingerprint is:
SHA256:xxxxx/B17z/xxxxxx zbs@zbs.local
The key's randomart image is:
+---[RSA 2048]----+
|    o+*.. EO*    |
|   ....          |
|    oo+    .o++.o|
+----[SHA256]-----+
~ ls ./test*
./test     ./test.pub
```

把私钥文件 ./test 的内容放到 `客户端的 ~/.ssh/id_rsa`，再使用密码试登陆到服务器后，将公钥内容 `./test.pub` 里的内容放到 `服务器的 ~/.ssh/authorized_keys`。

再次登陆时，ssh 会自动使用自己的私钥来认证，也就避免了输出密码。

#### 批量操作
公钥登陆帮我们避免了每次登陆服务器要输出密码的麻烦，它同时也解决了每个登陆会话都会同步阻塞的问题，这样我们就可以利用 ssh 的 `ssh user@host command` 方式来直接在服务器上执行命令。

同时，在我们拥有一个 ip 列表的情况下，使用 for 循环遍历 ip 列表，在多个服务器上批量执行命令也就成为了可能。

关于批量执行，已经有很多开源工具了，如使用 python 编写的 [pssh](https://pypi.org/project/pssh/)，C++ 编写的 [hss](https://github.com/six-ddc/hss)（帮同事做个广告）等。

## 多服务器文件合并
---
前几天，帮同事在多个服务器上查找日志，需要把在多个服务器上查到的日志都汇总到同一台机器上进行统计分析。我是用 pssh 登陆的多个服务器，由于日志量太大，查出来的结果输出到终端上再复制有些不现实，而使用重定向，结果又会重定向到各自的服务器。

#### scp
这时候可以使用 `scp`，scp 跟 ssh 是同一家族的命令，也是基于 SSH 协议实现的安全传输协议。只要在各个服务器之间互相保存着对方的公钥，就可以跟 ssh 命令一样，实现免密操作。

scp 的常见用法是 `scp src dst`，其中远程路径可以表示为 `user@host:/path`。在批量登陆的情况下，可以使用 grep 等命令先把结果文件输入到一个文件中，再使用 scp 命令将其复制到同一台服务器。

为了避免各个服务器的文件名冲突，可以使用 `uuidgen | xargs -I {} scp result.log root@ip:/result/{} ` 将各个服务器的结果复制到不同的文件中，再使用 cat 将 result 文件夹中的文件合并到一块。

#### nc
当然，大多数情况下，我们的服务器之间并不会互相保存公钥，不过 `nc` 命令可以完美解决这个问题。

nc 的 `-k` 选项，可以让 nc 服务端在文件传输结束后保持连接不关闭。这样，我们使用 `nc -k -4l port > result.log` 启动一个 nc 服务端，再使用 `grep xxx info.log | nc ip port` 即可实现结果数据的合并。

## 小结
---
本文介绍的各个工具还是属于开发的小打小闹，了解多一些工具总是好的。如果做运维工作的话，还是需要依赖 OPS 平台集成更多功能，实现完整的自动化。

{{ site.article.summary }}