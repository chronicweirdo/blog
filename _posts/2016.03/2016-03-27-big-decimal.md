---
title: 'Big Dec'
date: 2016-03-27 19:45:00 BST
tags: ['java', 'fixed precision', 'data types']
---

What is 63.81 plus 2.48 plus 3.31? In Java? 69.6? Could be. Could also be 69.600000000000002309263891220325604081153869628906250.

<!--more-->

This is a very basic lesson in programming, but it may be one you missed. I first remember noticing this while building one of my first software systems. Half-way through development, we noticed our aggregated financial data did not look well. We were having _waaay_ more decimals in our sums than was logically possible. This was happening because we were using the wrong data type to store financial numbers. A rookie mistake, but my excuse was that I was a rookie. A few refactorings later, everything was good.

The way numbers work in a programming language depends on the way they are represented in memory. You need to choose your data type wisely. Doubles are great for making complex floating point operations, as long as you understand that the result you obtain may not be 100% accurate. They are versatile enough for most applications, for example computing the position of an object in a gaming physics system. You just need an accurate enough value to use and position an object on the screen until the position for the next frame is computed. A small difference from the actual result will not be observable. But there are applications where the slightest difference can be a big problem. Let's go with financial data. Taking our leading example, summing up some costs, you want your client to pay the actual sum of 69.6, instead of 69.60000000000001, the sum you obtain by using doubles.

Run the following test:

``` java
@Test
public void testDoubleSum() {
    System.out.println("double sum");
    Double a = 63.81;
    Double b = 2.48;
    Double c = 3.31;
    System.out.println(a + b + c);
}
```

and you will see get the following result printed to output:

``` text
double sum
69.60000000000001
```

Not what we want. Like I said, this is a beginner's mistake, but I still see this pop up in software I am working on, which made me realize people are not that aware of this problem. What do you, as a programmer, do to fix this? Find the fixed-precision data type in you programming language and use that. For Java, that is BigDecimal. Take a look:

``` java
@Test
public void testBigDecimalSum() {
    System.out.println("big decimal (from double) sum");
    BigDecimal a = new BigDecimal(63.81);
    BigDecimal b = new BigDecimal(2.48);
    BigDecimal c = new BigDecimal(3.31);
    System.out.println(a.add(b).add(c));
}
```

``` text
big decimal (from double) sum
69.600000000000002309263891220325604081153869628906250
```

_Oh, wait!..._ How did this help? What happened? Well, when we are creating the BigDecimal objects, we are still using float numbers to initialize them, and some of the numbers we use don't look good in float. Run the following code to see what I mean:

``` java
@Test
public void testBigDecimalFromFloat() {
    BigDecimal a = new BigDecimal(63.81);
    System.out.println("a: " + a);
    BigDecimal b = new BigDecimal(2.48);
    System.out.println("b: " + b);
    BigDecimal c = new BigDecimal(3.31);
    System.out.println("c: " + c);
}
```

``` text
a: 63.81000000000000227373675443232059478759765625
b: 2.479999999999999982236431605997495353221893310546875
c: 3.310000000000000053290705182007513940334320068359375
```

So how do we do this right? We use string! BigDecimal knows how to initialize from strings and that is the recommended constructor to use when working with fractional values:

``` java
@Test
public void testBigDecimalFromStringSum() {
    System.out.println("big decimal (from string) sum");
    BigDecimal a = new BigDecimal("63.81");
    BigDecimal b = new BigDecimal("2.48");
    BigDecimal c = new BigDecimal("3.31");
    System.out.println(a.add(b).add(c));
}
```

``` text
big decimal (from string) sum
69.60
```

This is the result we are looking for! So remember, when precision is important, use a fixed-precision data type.
