---
layout: post
title:  'JavaScript scroll effects'
date:   2015-08-01 20:00:00
tags: ['javascript', 'ui', 'design']
---

The idea
---

The basic thing to understand when implementing scroll effects is to realize that you just need to make an element size and position a function of the document scroll value. And even more, all html positions are already functions of document scroll value - as the scroll increases, each element top position decreases proportionally. Of course, you don't have to do anything for your web page to behave this way, browsers are implementing this behavior by default. But when you want to implement some scroll effect, you are just changing this positioning function a little. This is what we'll do now.

The effect I'll try to implement is to include "pages" in the html document that, when scrolled, will behave as if sliding up. Imagine you are reading a bunch of physical pages with a fixed gaze. As you read each page, you are moving it up until you reach the end and discard it. This reveals the next page which was lying under the first one. This is how your site will look once this effect is implemented.

Document structure
---

We won't need a complex document structure, we just need a way to define the "pages" we'll have in the document and separate them from the rest of the document. A document with three pages will look like this:

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

This is an abreviated version of the document I used for testing, which can be downloaded [here](/assets/2015.08/javascript_scroll_effects.html). You'll see there that I have included a lot of paragraphs. This is because I wanted to test that the effect is functioning properly even when pages are longer than the screen height we have. We want pages to slide up as we scroll down, until the end of page, and at the same time for the page below to remain fixed in its position.

Bird's-eye view of the script
---

When implementing this, we have two things to take care of:
1. Initialize the elements: set up the size of the elements based on the size of the window. This function needs to run when the page loads and every time the window size changes.
2. The scroll function: called on every scroll event, is responsible with bringing each element of the page to the correct state for the current scroll value.

I'll just go ahead and show you the document ready function which takes care of linking these two actions to page events:

~~~ javascript
$(document).ready(function() {
    initDocument();
    $(window).resize(initDocument);
    $(window).scroll(scrollFunction);
});
~~~

We initialize the document once the document finished loading and every time the window is resized. We also apply the scroll function on each scroll event.

Initializing the document
---

When we initialize the document, we'll be applying styles on the "page" elements that will change their size and positioning. We're making all elements fixed and placing them at the top of the page. If a page element is not high enough to cover a whole window, we'll make it high enough. If it is high enough, we won't change its height, and this means we can have pages longer that a window height. This is fine, we don't want to limit page height and we can design the scroll function to work well with higher pages. We could also not limit the minimum page height and allow pages that are smaller that the window, but in that case the effect will not be as clean (we'll have pages sticking out behind shorter pages).

Another thing we do in the initializing function is to compute the sum of the heights of all pages. We need this to decide how high the document should be. We still want our document to be as high as the sum of heights of the elements inside it because their position is a function of the scroll value - so we need the scroll value to be high enough to. When we set fixed positioning on the page elements, we are taking them out of the document flow and that means that the document height will not include the page elements height. To fix this, we'll set the body element top padding to be as large as the page elements sum heights. This ensures that once we have scrolled over all pages, the rest of the document will flow in view and scroll normally.

We also need to set the z-index of the page elements to make sure they are overlapping each other in the correct order, the order of their appearance in the document (first page is the top page).

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

A surprisingly short function, considering that it is solely responsible for making the page slide effect work.

This function defines the top value of each page as a function of document scroll value. We go over each page and decide what its top value should be. If the scroll value is larger then the sum heights of previous pages it means we are scrolling the current page, so we'll update the page top value to how much we have scrolled since the start of the page. If we are not scrolling the current page (which means we are scrolling some page above it) we'll keep the page top value to 0 - the page is sill aligned at the top of the window.

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

There is an additional function, getHeight, which is also used in the initialization function. The getHeight function will get the height of a page, taking into consideration the padding values of the element.

~~~ javascript
function getHeight(element) {
    return $(element).height()
            + parseInt($(element).css("padding-top").replace("px", ""))
            + parseInt($(element).css("padding-bottom").replace("px", ""));
}
~~~
