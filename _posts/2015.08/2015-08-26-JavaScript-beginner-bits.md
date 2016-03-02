---
layout: post
title:  'JavaScript beginner bits'
date:   2015-08-26 14:15:00
tags: ['javascript', 'jquery', 'bits']
category: bits
---

It's an amusing occurrence when you scan some beginner material, dismissing chapter after chapter as something you already know until you're surprised to find out some very basic info you did not know. Exactly so I amused myself as I was skimming [David Sawyer McFarland's book "JavaScript & jQuery"](http://shop.oreilly.com/product/0636920015048.do). Here's to those small details that escape us as we learn a new subject and delight us when we discover them years later - the bits.

<!--more-->

jQuery delegate
---
With jQuery it's very easy to add event handling to elements in the page using the _bind_ function or shorthand functions for specific events, like _click_. These functions will only work for elements that are currently on the page. If you create elements dynamically, you'll have to remember to bind the desired events to new elements as you add them to the page. The good bit is that jQuery provides a different method for binding events to present and future events. The _delegate_ method receives a selector, an event and the function that will run when that event is triggered. The function is bound to the specified event for all existing and future elements that match the selector. Here's a short piece of code exemplifying this:

~~~ javascript
$(document).ready(function() {
    $(document).delegate(".add > input", "click", add);
    $(document).delegate(".remove > input", "click", remove);
});
function add() {
    $(this).parent().append($(this).parent().clone());
    $(this).parent().removeClass();
    $(this).parent().addClass("remove");
    $(this).val("remove");
}
function remove() {
    $(this).parent().remove();
}
~~~

~~~ html
<div class="add"><input type="button" value="add"></input></div>
~~~

We have a div with a button inside it. When the button is clicked, the original div is cloned and added to itself. The button of the original div is changed from an add button to a remove button. All events are binded dynamically, as new elements are added to the page but also as existing elements change their properties. [Download the jQuery delegate test file here](/assets/2015.08/delegate.html).

Saving selectors into variables
---

This is a best practice I'm afraid I have ignored for far too long. I'm mentioning it here in the hope that it will stick with me from now on. The idea is that whenever you run a jQuery select, jQuery looks at the whole DOM and finds the elements that fit you condition. There is no caching, so every subsequent select, even if with the same condition, will run the search all over again. It's better to spare your users' computers, so just save that select result in a variable if you're going to use it multiple times. Here's the _add_ function from above refactored to respect this practice:

~~~ javascript
function add() {
    var parent = $(this).parent();
    parent.append(parent.clone());
    parent.removeClass();
    parent.addClass("remove");
    $(this).val("remove");
}
~~~

jQuery find function
---

In the same practice class as the previous point, this function can be used to spare browser resources in certain scenarios. If you are working inside an element and need to select child elements based on some selector you could do:

~~~ javascript
var result = $("#parent a");
~~~

But this has the disadvantage of running over the whole document. You can use the _find_ function to run a search only inside the parent element:

~~~ javascript
var result = $("#parent").find("a");
~~~

JavaScript isNaN function
---

One last bit that I thought is worth mentioning is the JavaScript _isNaN_ function. This function can be used to test if a string can be parsed into a number.

~~~ javascript
console.log(isNaN("test")); // true
console.log(isNaN("-15.4")); // false
~~~

If a number is not a Not a Number then it is a number. That is all.
