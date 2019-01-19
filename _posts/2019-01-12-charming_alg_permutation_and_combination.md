---
layout: post
title: "迷人的算法-排列组合"
category: blog
tags: [combination, alg]
date: 2019-01-12 14:00:06 +0800
comments: true
---

## 需求
---
最近工作中碰到一个需求：我们的数据表有多个维度，任意多个维度组合后进行 group by 可能会产生一些"奇妙"的反应，由于不确定怎么组合，就需要将所有的组合都列出来进行尝试。

抽象一下就是从一个集合中取出任意元素，形成唯一的组合。如 `[a,b,c]` 可组合为 `[a]、[b]、[c]、[ab]、[bc]、[ac]、[abc]`。

要求如下：

- 组合内的元素数大于 0 小于等于 数组大小；
- 组合内不能有重复元素，如 [aab] 是不符合要求的组合；
- 组合内元素的位置随意，即 [ab] 和 [ba] 视为同一种组合；

看到这里，就应该想到高中所学习的排列组合了，同样是从集合中取出元素形成一个另一个集合，如果集合内元素位置随意，就是`组合`，从 b 个元素中取 a 个元素的组合有  $$C^a_b$$ 种。而如果要求元素顺序不同也视为不同集合的话，就是`排列`，从 m 个元素取 n 个元素的排列有 $$A^n_m$$ 种。

我遇到的这个需求就是典型的组合，用公式来表示就是从元素个数为 n 的集合中列出 $$\sum^n_{k=1} C^k_n$$ 种组合。

{{ site.article.copyright }}

文中算法用 Java 实现。

## 从排列到组合-穷举
----
对于这种需求，首先想到的当然是穷举。由于排列的要求较少，实现更简单一些，如果我先找出所有排列，再剔除由于位置不同而重复的元素，即可实现需求。假设需要从 [A B C D E] 五个元素中取出所有组合，那么我们先找出所有元素的全排列，然后再将类似 [A B] 和 [B A] 两种集合去重即可。

我们又知道 $$\sum^5_{k=1} A^k_5 = A^1_5 + A^2_5 + ... + A^5_5$$，那么我们先考虑一种情况 $$A^n_m$$，假设是 $$A^3_5$$，从 5 个元素中选出三个进行全排列。

被选取的三个元素，每一个都可以是 ABCDE 之一，然后再排除掉形成的集合中有重复元素的，就是 5 选 3 的全排列了。

代码是这样：

```java
    private static Set<Set<String>> exhaustion() {
        List<String> m = Arrays.asList("a", "b", "c", "d", "e");
        Set<Set<String>> result = new HashSet<>();
        int count = 3;
        for (int a = 1; a < m.size(); a++) {
            for (int b = 0; b < m.size(); b++) {
                for (int c = 0; c < m.size(); c++) {
                    Set<String> tempCollection = new HashSet<>();
                    tempCollection.add(m.get(a));
                    tempCollection.add(m.get(b));
                    tempCollection.add(m.get(c));
                    // 如果三个元素中有重复的会被 Set 排重，导致 Set 的大小不为 3
                    if (tempCollection.size() == count) {
                        result.add(tempCollection);
                    }
                }
            }
        }

        return result;
    }
```
对于结果组合的排重，我借用了 Java 中 HashSet 的两个特性：

- 元素唯一性，选取三个元素放到 Set 内，重复的会被过滤掉，那么就可以通过集合的大小来判断是否有重复元素了，
- 元素无序性，Set[A B] 和 Set[B A] 都会被表示成 Set[A B]。
- 另外又由于元素唯一性，被同时表示为 Set[A B] 的多个集合只会保留一个，这样就可以帮助将全排列转为组合。

可以注意得到，上面程序中 count 参数是写死的，如果需要取出 4 个元素的话就需要四层循环嵌套了，如果取的元素个取是可变的话，普通的编码方式就不适合了。

注: 可变层数的循环可以用 `递归` 来实现。

## 从排列到组合-分治
---
穷举毕竟太过暴力，我们来通过分治思想来重新考虑一下这个问题：

#### 分治思想
分治的思想总的来说就是"大事化小，小事化了"，它将复杂的问题往简单划分，直到划分为可直接解决的问题，再从这个直接可以解决的问题向上聚合，最后解决问题。

从 M 个元素中取出 N 个元素整个问题很复杂，用分治思想就可以理解为：

- 首先，如果我们已经从 M 中元素取出了一个元素，那么集合中还剩下 M-1 个，需要取的元素就剩下 N-1 个。
- 还不好解决的话，我们假设又从 M-1 中取出了一个元素，集合中还剩下 M-2 个，需要取的元素只剩下 N-2 个。
- 直到我们可能取了有 M-N+1 次，需要取的元素只剩下一个了，再从剩余集合中取，就是一个简单问题了，很简单，取法有 M-N+1 种。
- 如果我们解决了这个问题，已经取完最后一次了产生了 M-N+1 种临时集合，再考虑从 M-N+2 个元素中取一个元素呢，又有 M-N+2 种可能。
- 将这些可能聚合到一块，直到取到了 N 个元素，这个问题也就解决了。

还是从 5 个元素中取 3 个元素的示例：

- 从 5 个元素中取 3 个元素是一个复杂问题，为了简化它，我们认为已经取出了一个元素，还要再从剩余的 4 个元素中取出 2 个，求解公式为：$$C^3_5 = C^1_5 * C^2_4$$。
- 从 4 个元素中取出 2 个依旧不易解决，那我们再假设又取出了一个元素，接下来的问题是如何从 3 个元素中取一个，公式为 $$C^3_5 = C^1_5 * C^1_4 * C^1_3$$。
- 从 3 个元素中取 1 个已经是个简单问题了，有三种可能，再向上追溯，与四取一、五取一的可能性做乘，从而解决这个问题。

#### 代码实现
用代码实现如下：

```java
public class Combination {

    public static void main(String[] args) {
        List<String> m = Arrays.asList("a", "b", "c", "d", "e");
        int n = 5;

        Set<Set<String>> combinationAll = new HashSet<>();
        // 先将问题分解成 五取一、五取二... 等的全排列
        for (int c = 1; c <= n; c++) {
            combinationAll.addAll(combination(m, new ArrayList<>(), c));
        }

        System.out.println(combinationAll);
    }

    private static Set<Set<String>> combination(List<String> remainEle, List<String> tempCollection, int fetchCount) {
        if (fetchCount == 1) {
            Set<Set<String>> eligibleCollections = new HashSet<>();
            // 在只差一个元素的情况下，遍历剩余元素为每个临时集合生成多个满足条件的集合
            for (String ele : remainEle) {
                Set<String> collection = new HashSet<>(tempCollection);
                collection.add(ele);
                eligibleCollections.add(collection);
            }
            return eligibleCollections;
        }

        fetchCount--;
        Set<Set<String>> result = new HashSet<>();
        // 差多个元素时，从剩余元素中取出一个，产生多个临时集合，还需要取 count-- 个元素。
        for (int i = 0; i < remainEle.size(); i++) {
            List<String> collection = new ArrayList<>(tempCollection);
            List<String> tempRemain = new ArrayList<>(remainEle);
            collection.add(tempRemain.remove(i));
            result.addAll(combination(tempRemain, collection, fetchCount));
        }
        return result;
    }
}
```
其实现就是递归，关于递归和分治，有兴趣可以看一下隐藏篇： <a href="{{ site.baseurl }}/2019/01/recursion_and_divide_conquer.html"> 递归和分治</a>。
## 直击本质-位运算
---
从元素的全排列找全组合，比穷举略好，但还不是最好的方法，毕竟它"绕了一次道"。

很多算法都能通过位运算巧秒地解决，其优势主要有两点：一者位运算在计算机中执行效率超高，再者由于位运算语义简单，算法大多直指本质。

组合算法也能通过位运算实现。
#### 思想
再次考虑全组合的需求，从 M 个元素中取任意个元素形成组合，组合内元素不能重复、元素位置无关。

之前的方法都是从结果组合是否满足要求来考虑问题，考虑组合是否有重复元素、是否已有同样的组合等条件。如果换种思路，从待选元素上来考虑呢？

对于每个元素来说，它的状态就简单得多了，要么被放进组合，要么不放进组合。每个元素都有这么两种状态。如果从 5 个元素中任意取 N 个元素形成组合的话，用二进制位来表示每个元素是否被放到组合里，就是：

```
A  B  C  D  E
0  0  0  0  1   [E] = 1

A  B  C  D  E
0  0  0  1  0   [D] = 2

A  B  C  D  E
0  0  0  1  1   [DE] = 3
...
```
看到这里，应该就非常清楚了吧，每种组合都可以拆解为 N 个二进制位的表达形式，而每个二进制组合同时代表着一个十进制数字，所以每个十进制数字都就能代表着一种组合。

十进制数字的数目我们很简单就能算出来，从`00000...` 到 `11111...` 一共有 $$2^n$$ 种，排除掉全都不被放进组合这种可能，结果有 $$2^n-1$$ 种。

#### 代码实现
下面是 Java 代码的实现：

```java
public class Combination {

    public static void main(String[] args) {
        String[] m = {"A", "B", "C", "D", "E"};
        Set<Set<String>> combinationAll = combination(m);
        System.out.println(combinationAll);

    }

    private static Set<Set<String>> combination(String[] m) {
        Set<Set<String>> result = new HashSet<>();

        for (int i = 1; i < Math.pow(2, m.length) - 1; i++) {
            Set<String> eligibleCollections = new HashSet<>();
            // 依次将数字 i 与 2^n 按位与，判断第 n 位是否为 1
            for (int j = 0; j < m.length; j++) {
                if ((i & (int) Math.pow(2, j)) == Math.pow(2, j)) {
                    eligibleCollections.add(m[j]);
                }
            }
            result.add(eligibleCollections);
        }
        return result;
    }
}
```

## 小结
---
排列和组合算法在实际应用中很常见，而且他们的实现方法也非常具有参考意义。总的来说：排列用递归、组合用位运算。

{{ site.article.summary }}