---
layout: post
title: "递归与分治"
category: blog
tags: [Divide and conquer, Recursion, Alg]
date: 2019-01-19 10:00:06 +0800
comments: true
hidden: true
---

## 递归
---
"函数调用自己"，是递归的用法，是对递归很浅的一种认识。

在我的第一篇博客 <a href="{{ site.baseurl }}2015/10/optimization_recursion_with_memoization.html"> 用memoization优化递归算法[JS/PHP实现]</a> 中提到的斐波那契数列应该就是我们遇到的最基础的递归了，那时候的我，还只知道怎么用递归。

关于递归，维基百科上这样说：

>递归：在数学和计算机科学中，递归指由一种（或多种）简单的基本情况定义的一类对象或方法，并规定其他所有情况都能被还原为其基本情况。

拆解它的关键点来说：

- `简单的基本情况`： 也就是递归的终结条件，在上面的例子中，基本情况就是 fetchCount 等于 1， 在斐波纳契数列中，基本情况就是第 1、2 个元素都是 1。
- `其他所有情况都能还原为其基本情况`：即递归中所有情况都是相似的，且要能够把其他情况还原成基本情况。

    在上面全排列的例子中，所有情况都相似在从 M 个元素中取 N 个元素，放入到结果集合中，且最后都简化到了从 X 个元素中取一个的情况。
    在斐波那契数列中，所有的情况都相似在，N 等于 第 N-1 个元素加上第 N-2 个元素，且都能从后到前简化到第 1、2 个元素求和。
- `还原`：当然不能忘记这个重要步骤。

## 递归和分治
---
回想一下分治的思想，是不是和递归异曲同工？

它们都是倾向于将问题化简，直到化简到某一个终结条件，再层层向上追溯。

其实递归和分治并无不同，递归使用的就是分治的思想，它是分治思想的一种具体实现。

## 递归实现的可变嵌套层数
---
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