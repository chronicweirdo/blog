---
layout: post
title:  'Get-object pattern'
date:   2015-09-06 16:00:00
tags: ['java', 'design pattern']
---

I'll be exploring an approach, I'll call it a design pattern, for returning multiple values from a function. Some programming languages support this with tuples, but Java does not have support for such a data structure. The Java approach is implementing a new class that contains the values you want to return, then creating a function that returns the new object. What I'm advancing in this post is a way of defining your tuple and the function in the same place in such a way as to make using it as intuitive as possible. I'll start with the classic Java approach and then show you an implementation using what I call the "get-object" pattern. The example I'll be using is finding the minimum and maximum values inside a collection of numbers.

<!--more-->

The classic implementation
---

We have a collection of numbers and we want to find out the minimum and maximum values inside it. We may need these values to compute a histogram or display them in a chart. One way would be to create two functions, one that will find the minimum value and the other to find the maximum value, but this would mean searching twice through the collection. A better approach is to have one function that finds both minimum and maximum values at the same, going through the collection just once. This function will need to return both values, so we need a new object to contain these values. Here's the implementation.

~~~java
public class MinMaxTuple {
        private Integer min;
        private Integer max;

        public MinMaxTuple(Integer min, Integer max) {
            this.min = min;
            this.max = max;
        }

        public Integer getMin() {
            return min;
        }

        public Integer getMax() {
            return max;
        }
    }

    public MinMaxTuple findMinMax(Collection<Integer> numbers) {
        Iterator<Integer> iterator = numbers.iterator();
        Integer min, max;
        if (iterator.hasNext()) {
            Integer number = iterator.next();
            min = number;
            max = number;
        } else {
            min = 0;
            max = 0;
        }
        while (iterator.hasNext()) {
            Integer number = iterator.next();
            if (number < min) {
                min = number;
            }
            if (number > max) {
                max = number;
            }
        }
        return new MinMaxTuple(min, max);
    }
~~~

And we use the function and the new class like this:

~~~java
@Test
public void findMinMaxTest() throws Exception {
    List<Integer> numbers = Arrays.asList(new Integer[] {1, 2, 3, 4, 5, 6, 7, 8, 9});
    MinMaxTuple result = findMinMax(numbers);
    Assert.assertEquals((int) result.getMin(), 1);
    Assert.assertEquals((int) result.getMax(), 9);
}
~~~

So what is the problem with this implementation? There is no real big problem with it. It works, it's simple enough. What I don't like about it is that the function and the tuple are separate. We could have the findMinMax function defined as a static function inside the MinMaxTuple class and the two pieces of code would be in the same place, but I still don't find that elegant enough. In other words, we could do better, implement something that's simpler, clearer.

The get-object pattern
---

The MinMaxTuple class should be used only when searching for the minimum and maximum values, but the classic implementation does not make this fact clear enough. Someone who needs a 2-tuple of integer values can reuse this class, but this class was never intended to be used in a different context. We want to drive that point home! And we can do that with the get-object pattern idea. Here's the implementation:

~~~java
public class GetMinMax {
    private Integer min;
    private Integer max;

    public GetMinMax(Collection<Integer> numbers) {
        Iterator<Integer> iterator = numbers.iterator();
        if (iterator.hasNext()) {
            Integer number = iterator.next();
            min = number;
            max = number;
        } else {
            min = 0;
            max = 0;
        }
        while (iterator.hasNext()) {
            Integer number = iterator.next();
            if (number < min) {
                min = number;
            }
            if (number > max) {
                max = number;
            }
        }
    }

    public Integer getMin() {
        return min;
    }

    public Integer getMax() {
        return max;
    }
}
~~~

And here is how you use it:

~~~java
@Test
public void findMinMaxTest() throws Exception {
    List<Integer> numbers = Arrays.asList(new Integer[] {1, 2, 3, 4, 5, 6, 7, 8, 9});
    GetMinMax result = new GetMinMax(numbers);
    Assert.assertEquals((int) result.getMin(), 1);
    Assert.assertEquals((int) result.getMax(), 9);
}
~~~

So why is this approach better? Because the GetMinMax class will only be used to get the minimum and maximum values in a collection of numbers. There is no possibility of using this class out of context. There is a single constructor that receives a collection of numbers. The constructor finds the minimum and maximum values in that collection of numbers and saves them into read-only internal variables.

If you need to use tuples in you Java program often then it would be justified to implement a tuple class. But if you just need a tuple for a single specific operation there is no reason to implement a generic tuple class. From a design point of view, your design is more robust when it is clear what the purpose of each class is and when the implementation will prevent others from using your classes in unexpected ways. The get-object pattern respects these design guidelines.
