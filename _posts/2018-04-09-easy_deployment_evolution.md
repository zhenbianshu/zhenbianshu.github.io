---
layout: post
title: "一键部署进化史"
date: 2018-04-09 16:25:06 +0800
comments: true
---

为了解决调试不便的问题，先是同步工具由 nc 转到 rsync，再修改 rsync 源码添加回调参数，最后添加 docker 重启完成的通知信息，成功完成一键部署系统。

## 前言
----
之前的文章说过 由 PHP 转到 Java 之后，非常不适应的一点就是代码部署过程耗时长，调试不便，虽然可以使用 debug，但有时候还是需要修改代码，重新部署测试机系统，整个流程需要：

- 使用 mvn 命令将项目打成 war 包，耗时 1 min；
- 从开发机向测试机上传 war 包，公司内使用无线局域网，上传速度峰值只有 1M 不到，而且很不稳定，面对 100M+ 的 war 包，有点力不从心，此步骤耗时 2.5 min；
- 服务端重启 docker 进程，耗时 1 min；

再加上需要两台机器切换操作，步骤之间不连贯，需要在边上看着进度，以及时操作下一步。可以说，等到想要的代码上传到测试机运行，花儿都谢了。

作为一个懒人，迫切地需要简化一下流程，虽然可能达不到像 PHP 一样秒传文件立即生效，也要尽量快且方便地部署测试包，别操这么多心。本文就介绍我是怎么一步步优化测试部署流程的。

{{ site.article.copyright }}

## nc 时代
----
刚入职时，对 Java 的布置相关一脸懵逼，有同事给了一个脚本和两条命令，是为最原始的“自动部署系统”：

1. 先在测试机上执行脚本，脚本会启用一个 nc 接收进程，监听某一个端口，命令为 `nc -4l xxPort > ROOT.war`；
2. 自己在开发机上执行一条 mvn 命令，将项目打包，命令为 `mvn clean package project`；
3. 再在开发机上执行 nc 上传命令，连接测试机 IP 和端口，以打好的 war 包为输入流 `nc testIp xxPort < test-1.0.0.war`；
4. 传输完 war 包后，脚本会自动重启 docker 机，重启完成后就可以进行测试了。

nc 是 NetCat 的简称，这个小工具用于同步两台服务器间的文件，使用时，先在接收端监听一个端口并指定输出文件，再在发送端连接 IP 和端口，并指定输入流， nc 命令很简单，网络上资料也很多，这里不再多提了。

这个脚本虽然比全部手动好了一些，能帮我少输两个命令（nc 服务端、重启命令），可是时间上并没有缩短，可是乌龟似的上传速度真的不能忍，这时我开始想着怎么加速上传。

## rsync “加速”上传
----
其实一开始我是想从硬件方面解决这个问题的，即使用网线。为此，买了一个网线转接头和一段网线，可是通过同事的设备测试发现转接头和网线都没问题，可是接到一块就不匹配（围笑）。

穷则思变，接着我考虑从软件方面解决这个问题。问了几个同事后，发现有的同事在用 rsync 同步文件，可是 `rsync 同步文件的单位不是文件` 吗？看了同事演示的上传后，感觉心态崩塌，不好好读文档的后果啊，走了好多弯路。

这里简要介绍一下 rsync 的使用：

#### 服务端
服务端需要启动一个 rsync daemom 进程监听某一端口，默认配置文件在 `/etc/rsyncd.conf`，以 `module` 为单位进行用户认证、权限校验、目标文件夹等配置，一个常见的 rsyncd 配置如下：

```shell
# general conf
port=873 # 监听端口
max connections=500
log file=/var/log/rsyncd.log
pid file=/var/run/rsyncd.pid # pid 文件

# module 可多个
[zbs]
path = /data1/zbs # zbs模块的根目录
read only=no
use chroot=no
uid=root
gid=root
auth users=zbs // 要进行用户认证的用户名
secrets file=/etc/rsyncd.scrt # 用户名对应的密码存放文件，每行一个，都是以 "zbs:password" 的形式
ignore errors
exclude = .git/ # 排除掉 .git 文件夹
```

#### 客户端
而在客户端，我们只需要使用 `rsync [-option] fileOrDir rsync://{user}@{host}:{port}/{moduleName}/dir` 就可以将本地文件同步到服务端了。

至于密码，可以使用 `--password-file=/path/to/pwdFile` 的形式，也可以在调用 rsync 命令之前设置环境变量：`export RSYNC_PASSWORD=XXXX`；

至于 rsync 的同步算法， 推荐陈皓大神的文章：[RSYNC 的核心算法](https://coolshell.cn/articles/7425.html)

rsync 解决了上传速度的问题，但是又引入了新的问题：我必须等着上传结束，并且上传结束后还要登陆测试机手动重启 docker 服务，挺不方便的。

## 修改 rsync，添加回调选项
----
这时我开始打 rsync 源码的主意了，rsync 是一个开源软件，我考虑帮它加一个参数，让它帮我在文件上传结束后自动执行一些命令。

说做就做，从 [rsync官网](https://rsync.samba.org/download.html) 下载到 rsync 的源码开始查看并动手修改。rsync 的源码代码量还是挺大的，不过修改它我们不需要通读，只修改读取参数并使用就行了。我将这个问题分为两个步骤：

- 读取到 callback 参数的值；
- 上传结束后调用 callback 参数的值；

首先在 `proto.h` 文件里添加函数声明： `char *lp_callback(int module_id);`

读取参数的相关代码在 `load_param.c` 文件内，首先添加变量声明、设置默认值，最后添加参数调用函数。

服务端文件同步的代码在 `clientserver.c` 文件内，主体是 `rsync_module` 函数，前面的一系列操作如用户认证、权限校验等我们可以不必管，找到最后一步，在其调用下一次同步函数前 添加如下代码（解释在注释中）：

```c
    char * callback = lp_callback(i); // 读取 callback 参数
    if (callback != NULL && strlen(callback) != 0) {
        char cmd[strlen(callback) + 2];
        strcpy(cmd, callback);
        strcat(cmd, " &"); // system 命令会阻塞，需要在命令上添加 & 让它后台执行
        system(cmd); // 使用 stdlib 的 system 执行 callback 命令
    }
```

修改后的源码见：[Github-zhenbianshu-rsyncCallback](https://github.com/zhenbianshu/rsyncCallback)

这样，我给自己上传用的 module 添加一个脚本作为 callback，在每次上传完后，都会执行这个 callback 脚本，脚本里我可以配置上服务的重启，自动部署就实现了。

## docker-compose tomcat 自动部署
----
其实 tomcat 是可以自动部署的，需要配置 `server.xml`的 Host 元素，将 autoDeploy 属性置为 true，文档：[Tomcat Web Application Deployment](https://tomcat.apache.org/tomcat-9.0-doc/deployer-howto.html)。

可是我们的服务是基于 docker-compose 进行部署的，如果修改 server.xml 还需要将文件映射到 docker image 里。

其中 docker 可以这么配置：

```shell
FROM tomcat:7-jre8
COPY server.xml /usr/local/tomcat/conf/
```

docker-compose 可以在 yml 配置文件里添加如下配置：

```shell
image:
    tomcat-base
volumes:
   - ./path/server.xml:/usr/local/tomcat/conf/server.xml
   - ./path/webapps:/data1/project/webapps
```

这样，每当上传了新的 war 包，tomcat 就会自动监测到并重新部署服务；

此时，还有一个需求， war 包同步完成，重启完成后我不知道，得随时关注 tomcat 的服务日志，以尽快得知重启结果，及时测试，如果服务重启完就立即告诉我就最好了。

## 添加通知
----
此时，我修改的 rsync 就有了作用了，使用 callback 参数在测试机启动一个脚本以监测 tomcat 的服务日志，服务重启完成后会输出 `Server startup in xxx ms`，如果监测到有新的 log 输出，则发送一个通知告诉我。

callback 参数配置的脚本类似于：

```shell
#!/bin/bash

docker-compose stop -t 0
`rm /data1/project/webapps/ROOT -rf`
sleep 1
docker-compose start

sleep 5 # 这里等待一会，使大量 tomcat 日志覆盖掉上一次重启的结果日志
date=`date "+%Y-%m-%d"`
catalina_log="/data1/project/logs/catalina.$date.log"

while : # 重复检测日志最后一行，直到输出了重启成功的标识
do
	finish=`tail -n 1 $catalina_log | grep 'Server startup'`
	if [ -n "$finish" ]
	then
		break
	fi
	sleep 0.1
done

`curl -u "user:password" -d "uid=5715965217&text=succ" "messages/new.json"` # 调用接口发送通知
```
其实在测试机启动一个守护进程用来实时监测日志也是可以的，但是需要处理日志的新旧逻辑。

至于通知，有很多工具可以使用，微博、QQ、微信、短信等通讯工具都提供有对外的 http 接口，这个可以依各人喜好选择使用。

## 小结
----
最后把开发机上的 mvn 打包命令和 rsync 同步命令也包装成脚本，如下所示：

```shell
#!/bin/bash
mvn clean  -DskipTests=true package -Pwar -am -pl project
file=`find /path/to/project/target -name "*.war"`
export RSYNC_PASSWORD=123456
rsync -avz $file rsync://zbs@IP:PORT/zbs/ROOT.war
```

再给脚本添加一个 alias 别名 `alias test="myshell.sh"`，真正的一键部署就完成了，在部署测试环境时，只需要在项目目录下输入一条命令 `test` 就开始自动部署了，这时候可以放手去喝杯水或做些其他事，等收到消息通知后，回来继续测试即可。

部门正在搭配 git 系统做自动部署测试系统，非常期待 push 过代码后就可以迅速测试的场景。果然，懒才是第一生产力啊~

{{ site.article.summary }}
