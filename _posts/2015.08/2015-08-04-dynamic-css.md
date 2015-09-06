---
layout: post
title:  'Dynamic CSS'
date:   2015-08-04 09:30:00
tags: ['css', 'ui', 'javascript']
excerpt: Creating and injecting dynamic style sheets (CSS) in a HTML page.
---

Usually when I want to dynamically manipulate the CSS of some elements on a page, I wait for the document to load and then use JavaScript to apply the new CSS to all elements that match some rule. At least, I used to do that, but it's not the best approach. If the document takes longer to load, let's say you have a video embedded on the page, you'll be looking at an incorrectly-formatted page for a while before everything falls into place. Surely, an undesirable situation.

But first, why would one have dynamic CSS? In my case, I want to set some dimension settings based on the window size. The best approach is to have a well-designed CSS file, with media queries for different screen sizes, but in the real world one can't always go with the best approach. So let's not judge and focus on finding a solution. Firstly, design your CSS as best you can and make your site usable and proper for those instances when the browser loading it does not allow scripts.

Secondly, we'll look at a better method to apply dynamic CSS. The idea is simple: apply the style when you have enough information (the window size) but before the document body starts loading. Apply the dynamic CSS after the head of the document was loaded. And for this CSS to work on the elements that are about to load, create a dynamic style sheet in the document head instead of trying to apply the rules directly on the elements.

~~~ javascript
$('head').ready(function() {
    buildDynamicStyle();
});

function buildDynamicStyle() {
    var style = document.createElement("style");
    style.appendChild(document.createTextNode(""));
    document.head.appendChild(style);
    var sheet = style.sheet;

    var rule = computeDynamicRule();
    sheet.insertRule(computeDynamicRule(), 0);
}

function computeDynamicRule() {
    var padding = computePadding();
    return 'body > * {'
         + '    padding-left:' + padding + ';'
         + '    padding-right:' + padding + ';'
         + '}';
}

function computePadding() {
    var clientWidth = document.documentElement.clientWidth;
    var padding = ((clientWidth - 800) / 2) + 'px';
    return padding;
}
~~~

You can see in the code above that as soon as the head element is loaded we run our script to generate the dynamic CSS. We create a new *style* element in the document and insert a generated rule into it. The rule is the CSS as string. We build this CSS string using information we have about the window width.

There is more to talk about on this subject, and you can gain more insight here:

1. [Add Rules to Stylesheets with JavaScript](http://davidwalsh.name/add-rules-stylesheets)
2. [Change style sheet](http://www.quirksmode.org/dom/changess.html)
