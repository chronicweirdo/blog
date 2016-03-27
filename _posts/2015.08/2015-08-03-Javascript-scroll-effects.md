---
layout: post
title:  'JavaScript scroll effects'
date:   2015-08-03 09:00:00 EET
tags: ['javascript', 'ui', 'design']
excerpt: "The only thing to understand when implementing scroll effects is to realize that you just need to make an element size and position a function of the document scroll value. If you really stop and consider it, all html elements positions are already functions of document scroll value. As the scroll increases, each element top position decreases proportionally. Of course, you don't have to do anything for your web page to behave this way, browsers are implementing this behavior by default. But when you want to implement your own scroll effect, know that you are just changing this positioning function a little. This is what we'll do now."
---

The idea
---

The only thing to understand when implementing scroll effects is to realize that you just need to make an element size and position a function of the document scroll value. If you really stop and consider it, all html elements positions are already functions of document scroll value. As the scroll increases, each element top position decreases proportionally. Of course, you don't have to do anything for your web page to behave this way, browsers are implementing this behavior by default. But when you want to implement your own scroll effect, know that you are just changing this positioning function a little. This is what we'll do now.

<!--more-->

The effect I'll try to implement is to split the html document into *pages*. When the document is scrolled, each page in turn will slide up. Imagine you are reading a bunch of physical pages with a fixed gaze. As you read each page, you are moving it up until you reach its end and discard it. This reveals the next page which was lying under the first one. This is how your site will look once this effect is implemented.

Document structure
---

We won't need a complex document structure, we just need a way to define the *pages* we'll have in the document and separate them from the rest of the document. A document with three pages will look like this:

~~~ html
<body>
    <div style="background-color: beige" class="page">
        <h2>The first page</h2>
        <p>Lorem ipsum dolor sit...</p>
        <p>In vitae suscipit nisl...</p>
    </div>
    <div style="background-color: burlywood" class="page">
        <h2>The second page</h2>
        <p>Lorem ipsum dolor sit amet...</p>
    </div>
    <div style="background-color: cornflowerblue" class="page">
       <h2>The third page</h2>
       <p>Lorem ipsum dolor sit...</p>
    </div>
    <p>Lorem ipsum dolor sit...</p>
~~~

This is an abreviated version of the document I used for testing. [Download the full document here](/assets/2015.08/javascript_scroll_effects.html). You'll see there that I have included a lot of paragraphs. I wanted to test that the effect is functioning properly even when pages are too long to fit on screen. We want each page to slide up as we scroll down, until we reach its end, while at the same time for all pages below to remain fixed in their original position.

Bird's-eye view of the script
---

When implementing this, we have two things to take care of:

1. Initialize the elements: set up the size of the elements based on the size of the window. This function needs to run when the page loads and every time the window size changes.
2. The scroll function: called on every scroll event, is responsible with bringing each element of the page to the correct state (position/size) for the current scroll value.

I'll just go ahead and show you the document ready function which takes care of linking these two actions to page events:

~~~ javascript
$(document).ready(function() {
    initDocument();
    $(window).resize(initDocument);
    $(window).scroll(scrollFunction);
});
~~~

Once the document finished loading we run the initialization function. We will do this every time the window is resized. We also apply the scroll function on each scroll event.

Initializing the document
---

When we initialize the document, we'll be applying styles on the *page* elements that will change their size and positioning. We're switching all elements to fixed positioning and placing them at the top of the page. If a *page* element is not high enough to cover a whole window, we'll make it high enough. If it is high enough, we won't change its height, and this means we can have *pages* longer than a window height. This is fine, we don't want to limit *page* height and we can design the scroll function to work well with longer pages. (We could also not limit the minimum *page* height and allow *pages* that are smaller that the window, but in that case the effect will not be as clean since we might end up with long *pages* sticking out form below.)

Another thing we do in the initializing function is to compute the sum of the heights of all *pages*. We need this to decide how high the document should be. We still want our document to be as high as the sum of heights of the elements inside it because their position is a function of the scroll value. In other words, we need the scroll value to go high enough to allow us to scroll each element of the document at the same pace they would be scrolled with the default, browser-implemented scroll function. When we set fixed positioning on the *page* elements, we are taking them out of the normal document flow and that means the document height will not include the *page* elements heights. To fix this, we'll set the body element top padding to be as large as the sum of *page* elements heights. This ensures that once we have scrolled over all *pages*, the rest of the document will flow in view and scroll normally.

We also need to set the z-index of the *page* elements to make sure they are overlapping each other in the correct order, the order of their appearance in the document (first page is the top page).

~~~ javascript
function initDocument() {
    var windowHeight = document.documentElement.clientHeight;
    var windowWidth = document.documentElement.clientWidth;

    var height = 0;
    $(".page").each(function(index, element) {
        $(element).css("position", "fixed");
        $(element).css("display", "block");
        $(element).css("top", 0);

        var elementHeight = $(element).height();
        if (elementHeight < windowHeight) {
            var verticalPadding = (windowHeight - elementHeight) / 2;
            $(element).css("padding-top", verticalPadding + "px");
            $(element).css("padding-bottom", verticalPadding + "px");
        }

        $(element).css("z-index", -index);

        height = height + getHeight(element);
    });
    $("body").css("padding-top", height + "px");

    scrollFunction();
}
~~~

This can be improved, we don't need to reapply all the styles on every window resize, only values that are affected by the window size. It should be a simple refactoring, be sure to clean this up if you'll use it in a live project.

The scroll function
---

A surprisingly short function, considering that it is solely responsible for making the *page* slide effect work.

This function defines the top value of each *page* as a function of document scroll value. We go over each *page* and decide what its top value should be. If the scroll value is larger then the sum heights of previous *pages* it means we are scrolling the current *page*, so we'll update the *page* top value to how much we have scrolled since the start of the *page*. If we are not scrolling the current *page* (which means we are scrolling some *page* above it) we'll keep the *page* top value to 0. That way the *page* is sill aligned at the top of the window.

~~~ javascript
function scrollFunction() {
    var height = 0;
    $(".page").each(function(index, element) {
        var scroll = $(document).scrollTop()
        if (scroll > height) {
            $(element).css("top", (height - scroll) + "px");
        } else {
            $(element).css("top", 0);
        }
        height = height + getHeight(element);
    });
}
~~~

There is an additional function, getHeight, which is also used in the initialization function. The getHeight function will get the height of a *page*, taking into consideration the padding values of the element.

~~~ javascript
function getHeight(element) {
    return $(element).height()
            + parseInt($(element).css("padding-top").replace("px", ""))
            + parseInt($(element).css("padding-bottom").replace("px", ""));
}
~~~

The result
---

Here's a short video of how the effect looks like in the end:

<p class="video">
    <iframe width="560" height="315" src="https://www.youtube.com/embed/4_ZxThmpGnU" frameborder="0" allowfullscreen></iframe>
</p>

[You can download the whole scroll effects file here](/assets/2015.08/javascript_scroll_effects.html). Use it wisely.
