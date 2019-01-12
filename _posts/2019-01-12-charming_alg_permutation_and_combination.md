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

看到这里，就应该想到高中所学习的排列组合了，同样是从集合中取出元素形成一个另一个集合，如果集合内元素位置随意，就是`组合`，从 b 个元素中取 a 个元素的组合有  $$C^a_b$$ 种。而如果要求元素顺序不同也视为不同集合的话，就是排列，从 m 个元素取 n 个元素的排列有 $$A^n_m$$ 种。

我遇到的这个需求就是典型的组合，用公式来表示就是从元素个数为 n 的集合中列出 $$\sum^n_{k=1} C^k_n$$ 种组合。

{{ site.article.copyright }}

文中算法用 Java 实现。

## 从排列到组合-穷举
----
对于这种需求，首先想到的当然是穷举。由于排列的要求较少，实现更简单一些，如果我先找出所有排列，再剔除由于位置不同而重复的元素即可。假设需要从 [A B C D E] 五个元素中取出所有组合，那么我们先找出所有元素的全排列，然后再将类似 [A B] 和 [B A] 两种集合去重。

我们又知道 $$\sum^5_{k=1} A^k_5 = A^1_5 + A^2_5 + ... + A^5_5$$，那么我们先考虑一种情况 $$A^n_m$$ 假设是 $$A^3_5$$。

#### 蛮力穷举
首先我们将所有组合都列出来，然后过滤掉有重复元素的集合，那么我们的程序就得这么写：

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

- 元素无序性，Set[A B] 和 Set[B A] 都会被表示成 Set[A B]。
- 元素唯一性，被同时表示为 Set[A B] 的多个元素只会保留一个。

#### 递归穷举

可以注意得到，上面程序中 count 参数是写死的，如果需要取出 4 个元素的话就需要四层循环嵌套了，这时候只好使用递归来帮助穷举。

最终的代码是这样：

```java
public class Exhaustion {
    private static List<String> m = Arrays.asList("a", "b", "c", "d", "e");

    public static void main(String[] args) {
        int n = 5;

        Set<Set<String>> combinationAll = new HashSet<>();
        for (int c = 1; c <= n; c++) {
            Set<Set<String>> duplicated = exhaustion(new HashSet<>(), c);
            for (Set<String> set : duplicated) {
                if (set.size() == c) {
                    combinationAll.add(set);
                }
            }
        }

        System.out.println(combinationAll);
    }

    private static Set<Set<String>> exhaustion(Set<String> tempSet, int count) {
        Set<Set<String>> result = new HashSet<>();

        if (count == 1) {
            Set<Set<String>> finalCollection = new HashSet<>();
            for (String ele : m) {
                Set<String> tempCollection = new HashSet<>(tempSet);
                tempCollection.add(ele);
                finalCollection.add(tempCollection);
            }

            return finalCollection;
        }

        count--;
        for (int i = 1; i < m.size(); i++) {
            Set<String> tempCollection = new HashSet<>(tempSet);
            tempCollection.add(m.get(i));
            result.addAll(exhaustion(tempCollection, count));
        }

        return result;
    }
}
```

## 从排列到组合-递归分治
---
穷举毕竟太过暴力，我们来通过分治思想来重新考虑一下这个问题：
由于组合内元素的不可重复性，每次从集合内取出一个元素后，集合内的可用元素就要少 1。

还是从 5 个元素中取 3 个元素的示例：

- 第一次取，从 5 个元素中取 1 个元素，产生了 5 种只包含一个元素的集合，这时候我们只需要考虑怎么从剩下的四个元素中取到 2 个，此时的公式为 $$C?^3_5 = C^1_5 * C^2_4$$。
- 第二次取，我们拿着这 5 种只有一个元素的集合，从各自剩余的 4 个元素中再取出 1 个元素，此时我们只需要考虑怎么从剩下的三个元素中再取一个，此时的公式为 $$C?^3_5 = C^1_5 * C^1_4 * C^1_3$$。
- 第三次取，我们拿着这些包含两个元素的集合，从各自剩余的 3 个元素中再取出一个元素，即可获取到所有的组合。

不管一共要取多少个元素，最终都会归结成只取 1 个。

而用代码实现如下：

```java
public class Combination {

    public static void main(String[] args) {
        List<String> m = Arrays.asList("a", "b", "c", "d", "e");
        int n = 5;

        Set<Set<String>> combinationAll = new HashSet<>();
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

从形式上来看，跟上面的递归穷举差距不大，毕竟递归是分治思想的一种实现。

## 位运算
---



## 小结
---