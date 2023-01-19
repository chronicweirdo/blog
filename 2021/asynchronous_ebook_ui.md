## Asynchronous E-book UI 

This is the second article in the e-book performance rewrite for my web-based reading application. The [first article](/2020/2020.12.10.custom_ebook_parser.html) dealt with parsing EPUB files into a format that can be used on both the server side and the UI side. With the parsing implemented in both Scala and Javascript, I could next move to rewriting the web UI for reading e-books.

The old implementation worked by taking HTML/XHTML resources out of the EPUB archive, rewrite links inside them to make them accessible in the context of the web application, and sent the resource for display to the UI. In addition, custom Javascript and CSS would also be inserted in the original HTML/XHTML resource. The Javascript code woule be triggerred once the resource was loaded on the UI and it would start the pagination computation. This computation used to be done on the main thread of the web page. The process was as follows: move all the content in a hidden section on the web page; start putting parts of the content in a visible area of the screen one word at a time, and check if an overflow was triggerred; if an overflow got triggered, remove the last word and save the start and end positions as one page; continue doing this until all pages corresponding to the current content have been found. Finally, once all pages have been found, display the desired page, corresponding to the requested position in the book. When the browser window got resized, the whole process would be triggerred again.

This computation would take a long time, and because it was done on the main thread of the web page it would often trigger a "slow Javascript" message from the browser that would give users the option to kill the Javascript thread and break the application functionality. With this in mind, the focus for the new implementation was obvious: page computation still has to be done on the UI side, because that is the only way to ensure what we consider a page will actually fit the viewport, but it has to be done in a way that does not block the UI Javascript thread, which is the only thread we have available in a web-page. Another improvement would be to display a page as soon as we have it available, as opposed to waiting for all the pages in a section to be computed before we can do that. And to be able to do that, we also need a way to compute the remaining pages in the background, while the application is being used.

My first approach for the new implementation was to look at web workers as a different thread where we could run the page computation algorithm. However, this did not pan out because the thread that runs web workers does not have access to the UI and it would take a lot of communication between the web worker thread and the main thread to update pages one word at a time and check for overflow.

The other option, which I used, was to make everything asynchronous. With asynchronous page computation, I would give the UI thread time react to user actions and whould also avoid the "slow Javascript" browser warnings. If we compute every page asynchronously, one at a time, we will have a mode decoupled code and have the option of displaying the "current" page as soon as it becomes available, reducing visible loading time.

## The New UI Structure

The first thing we need for this new implementation is an appropriate UI structure. We have a lot of the same elements in the page as for comic-book display, the UI controls that let us move between pages, `ch_prev` and `ch_next`, the controls that open the tools container, `ch_tools_left` and `ch_tools_right`, and the tools container `ch_tools_container`, and the spinner container `ch_spinner`, and a place to load our content, a page of the ebook, `ch_content`. But we have an additional container, `ch_shadow_content`, which we will use to compute pages in the background.

``` html
<body onresize="handleResize()">
    <div id="ch_prev"></div>
    <div id="ch_next"></div>
    <div id="ch_tools_left"></div>
    <div id="ch_tools_right"></div>
    <div id="ch_shadow_content"></div>
    <div id="ch_content"></div>
    <div id="ch_tools_container">
        <!-- ... -->
    </div>
    <div id="ch_spinner">
        <!-- ... -->
    </div>
</body>
```

With this new implementation, we no longer use the main content container to compute the pages, but the "shadow" content container and the main container still need to have the same styling, so we are sure that the pages computed in the "shadow" container will occupy the same space in the main container. However, the "shadow" container needs to not be visible, which will allow us to use it for page computation while allowing the UI to be used. But even if the "shadow" content is invisible, it should still take up space in the page, because that is the only way we can accurately use it to detect overflow when we compute pages. This means we can't use the `display: none` CSS property on the container, since this would make the container not get rendered and not occupy space at all. We have to use the `visibility: hidden` CSS property, because with this property the element will still take up space in the page, even if it does not show up in the page. This makes the CSS we use for these content containers the following:

``` css
#ch_content, #ch_shadow_content {
    width: 80vw;
    height: 90vh;
    left: 10vw;
    top: 5vh;
    display: block;
    position: fixed;
    word-wrap: break-word;
}
#ch_shadow_content {
    visibility: hidden;
}
```

## The New Implementation

Now that we have a reliable UI structure to work with, we can add the Javascript code.

``` js
window.onload = function() {
    // ...

    displayPageFor(parseInt(getMeta("startPosition")))
}
```

When an e-book is loaded we have a start position. If we never opened this book before, that position is 0, otherwise we use the latest saved progress position for a book.

The new implementation will have two main logic "threads", flows (they run on the same UI thread). The first one is responsible with showing pages to the user. This flow will try to show a page for a desired position, and if that page is not yet available it will request that it gets computed and try to display it again later. This flow gets invoked when a book is first loaded, and when the user flips between pages or jumps at specific positions in the book. The second flow is focused on computing pages. This second flow gets triggerred when the first flow request that a page is computed. Both flows are designed to only occupy the UI thread for as little time as possible, and if they still need to run code they will schedule themselves to execute that code at a later point in time.

``` js
function displayPageFor(position, firstTry = true) {
    showSpinner()
    var page = getPageFor(position)
    if (page == null) {
        // compute pages for section and retry
        if (firstTry) {
            computePagesForSection(position)
        }
        window.setTimeout(function() {
            displayPageFor(position, false)
        }, 100)
    } else {
        getContentFor(page.start, page.end, function(text) {
            var content = document.getElementById("ch_content")
            content.innerHTML = text
            document.currentPage = page
            // if book end is displayed, we mark the book as read
            if (page.end == parseInt(getMeta("bookEnd"))) {
                saveProgress(getMeta("bookId"), page.end)
            } else {
                saveProgress(getMeta("bookId"), page.start)
            }
            updatePositionInput(page.start)

            hideSpinner()
        })
    }
}
```

The `displayPageFor` function represents the first flow. It will first show the spinner, then request the page for a position. If the returned page is null, this means that the page is not available. If this is the first time the function tried to load that page, if will request that the page gets computed. It actually requests that all pages for the book section containing that position get computed, by invoking `computePagesForSection`, but we'll look at how the computation code works and how the `getPageFor` function works to understand how a page gets displayed as soon as it becomes available.

Whether the page computation was triggerred or not, if the `displayPageFor` function was not able to load the page it will schedule itself to try and display the page again 100 milliseconds later.

If, on the other hand, the page, represented by a start and end position, is already available, content for that page is loaded and displayed in the `#ch_content` container. Book progress is also updated at this step. Usually the first position in the page is saved as the current place in the book a user has reached, but there is a special case where, if the last position in the book is reached, that last position is saved as the user progress position. This will mark the book as read by the current user.

``` js
function getPageFor(position) {
    var savedPages = document.savedPages
    if (savedPages != null) {
        // search for page
        for (var i = 0; i < savedPages.length; i++) {
            if (savedPages[i].start <= position 
                && position <= savedPages[i].end) {
                // we found the page
                return savedPages[i]
            }
        }
    }
    // no page available
    return null
}
```

The `getPageFor` function will check a pages cache to see if the current position is part of a page in that cache. If the page is not there, it returns a null. For the page to get displayed as soon as it is avaialable, the code that computes the pages only needs to save the page positions to this pages cache as soon is it obtains them, and the `getPageFor` function will find them.

``` js
function computePagesForSection(position) {
    downloadSection(position, function(section) {
        window.setTimeout(function() {
            compute(section, section.start)
        }, 10)
    })
}

function downloadSection(position, callback) {
    var xhttp = new XMLHttpRequest()
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
            var jsonObj = JSON.parse(this.responseText)
            var node = convert(jsonObj)
            if (callback != null) {
                callback(node)
            }
        }
    }
    xhttp.open("GET", "bookSection?id=" + getMeta("bookId") + "&position=" 
               + position)
    xhttp.send()
}
```

The `computePagesForSection` function triggers a `downloadSection` function, which makes a call to the server to obtain that section. Once the section has been downloaded, it is parsed from string to JSON and then it is converted to a BookNode object, the Javascript implementation of the object described in the [previous article](/2020/2020.12.10.custom_ebook_parser.html). This BookNode object will have the necessary methods to manipulate the book content when computing and displaying it as pages. Once we have the `BookNode` object we pass it to the `compute` method, along with the start position of the section, because once we have a section we always start computing pages from the start of that section. All this code is asynchronous, relying on invoking callback functions only once data becomes avalable.

``` js
function compute(section, start) {
    var shadowContent = document.getElementById("ch_shadow_content")
    shadowContent.innerHTML = ""

    var tryForPage = function(previousEnd, end) {
        shadowContent.innerHTML = section.copy(start, end).getContent()
        scrollNecessaryAsync(shadowContent,
            function() {
                // we have found our page, it ends at previousEnd
                savePage(start, previousEnd)
                if (previousEnd < section.end) {
                    // this check is probably not necessary
                    // schedule computation for next page
                    window.setTimeout(function() {
                        compute(section, previousEnd + 1)
                    }, 10)
                }
            },
            function() {
                // if possible, increase page and try again
                if (end < section.end) {
                    var newEnd = section.findSpaceAfter(end)
                    tryForPage(end, newEnd)
                } else {
                    // we are at the end of the section, this is the last page
                    savePage(start, end)
                    // only update cache once all pages for section are computed
                    saveCache()
                }
            }
        )
    }
    var firstEnd = section.findSpaceAfter(start)
    tryForPage(firstEnd, firstEnd)
}
```

The `compute` function always works on a `BookNode` object with a `start` position and its focus is to compute _one_ page that begins with the start position. A page should always have some content, that is why the first end position is obtained by getting the first space after the start position. What is considered a space in the context of e-book parsing is discussed in the [previous article](/2020/2020.12.10.custom_ebook_parser.html). If we would use empty pages, make the first end position the same as the first start position, we would risk getting into infinite loops, if somehow a page contains some unforseen element that can't fit in the current display.

The rest of the page computation process is handed in the internal `tryForPage` function, which will copy the content between the start and end positions into the "shadow" content container and check if an overflow was triggerred. If the overflow was triggerred we have found out our current page should end at the `previousEnd` value, so we can now do things: save the current page to the pages cache and, if we have not reached the end of the current section, schedule the computation of the next page of the section after 10 milliseconds, with the start position of the next page being the current page end position plus one.

If the overflow did not get triggerred, we have two other options: either the end of the section was reached, in which case we have no more pages to compute, we save the current page to the pages cache, and we also store the pages cache to the browser storage with the `saveCache` function; or we have not reached the end of the section, in which case we find the next space in the section and try to see if increasing the page size will work.

This whole `compute` function is quite complicated because it has some internal recursion with the `tryForPage` function and it will also schedule itself for the next page computation if necessary, but there is also the `scrollNecessaryAsync` function that makes things even more complex.

``` js
function scrollNecessaryAsync(el, trueCallback, falseCallback) {
    var images = el.getElementsByTagName('img')
    var imageCount = images.length
    if (imageCount > 0) {
        var loadedImages = 0
        for (var i = 0; i < imageCount; i++) {
            var imageResolvedFunction = function() {
                loadedImages = loadedImages + 1
                if (loadedImages == imageCount) {
                    if (el.scrollHeight > el.offsetHeight 
                        || el.scrollWidth > el.offsetWidth) 
                    {
                        trueCallback()
                    } else {
                        falseCallback()
                    }
                }
            }
            images[i].onload = imageResolvedFunction
            images[i].onerror = imageResolvedFunction
        }
    } else {
        if (el.scrollHeight > el.offsetHeight 
            || el.scrollWidth > el.offsetWidth) {
            trueCallback()
        } else {
            falseCallback()
        }
    }
}
```

This `scrollNecessaryAsync` function will look at a HTML container element, in this specific case the `#ch_shadow_content` container, find all image elements inside, then wait for all images to load or to fail to load before checking if the overflow has been triggerred on that container element. It will then trigger the relevant callback, `trueCallback` if the overflow was triggerred or `falseCallback` otherwise. We need to do this because if parts of the e-book contain images, those images may take a while to load, and they won't occupy their space in the page until they have been loaded. This is why checking for overflow before all images in a potential page have been loaded is not useful, it will not give us reliable results.

With this, the new implementation of the e-book UI is done. The page display part of the code and the page computation part of the code work independently of each other, the time-consuming page computation is handled asynchronously which allows the UI to remain responsive to user input and will not upset the browser. Pages can now be computed reliably in the background while the application is being used. Moving between pages is easy, the next page function just has to request that the page at position current page end plus one is shown; the previous page function requests that the page at position current page start minus one is shown. In case these previous and next positions are part of different sections of the book, the algorithm can handle loading and computing pages for the new section. And this new implementation still keeps a cache of pages, just start and end positions, into the local storage of the browser, meaning that the next time a book is opened on the same device the page computation may not be necessary if we already have those pages available in the browser storage. The result is a responsive UI that makes the e-book reading experience as pleasureable as comic-book reading, and makes the [Chronic Reader app](https://github.com/chronicweirdo/reader) a well-rounded, polished project.

You can view the full [UI javascript code](https://github.com/chronicweirdo/reader/blob/master/src/main/resources/static/book2.js) and the [BookNode javascript implementation](https://github.com/chronicweirdo/reader/blob/master/src/main/resources/static/bookNode.js) on the project repository.