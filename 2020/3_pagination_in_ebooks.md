# Pagination in ebooks

This is the third article in the series discussing a new project for running your personal ebook and comic book server, Chronic Reader, available [here](https://github.com/chronicweirdo/reader).

Reading and displaying ebooks is a very different problem from displaying comic books. Just like comic book files, ebook files, specifically `epub`, are archives, so the problem of extracting data from them is similar to comic books. But the data in this case is not images but text. For `epub` it's text in HTML format. Displaying HTML in web browsers is a very simple solution, the quickest approach would be to just extract the HTML file from the ebook archive and send it to the browser for display. But the resulting experience does not resemble a book reading experience. You can't flip pages, you have to scroll through the text. Sometimes the book is split into sections, so after scrolling for many chapters, you have to click to switch to the next section. 

If we want a better user experience, we need to display the book in pages. Then the user can click on the left or right edge of the screen to move between pages. Sometimes, this action will take them to the next page in the current section, at other times, a whole new section needs to be loaded. This is the application I wanted to implement, but to do this I had to find a good way of deciding what goes into a page.

Finding out how much content out of a HTML document can fit into a page, or screen, can be a very complicated problem. If the content is just a block of text, we can expect roughly the same number of characters to fill a page. But our book may also contain tables and images. The book can have subtitles and different styling rules that change the spaces between lines of text, and how many characters are part of a page when we increase or reduce the text size. What about different devices that have different screen sizes? And finally, different browsers may have slight variations in the rendering code that decides how a HTML document is shown on screen.

I've looked into ways of approximating on the server side what can fit into a screen, but the reader application is a web application, the intention is to be compatible with any browser which means I have no control on the rendering engine. No control on the rendering engine means that any server side approximation will be irrelevant on the client. The most accurate solution is to compute what fits into a page directly on the client side, where we have access to the rendering engine.

The idea is simple: load the HTML document on the client and then split the document into pages based on the current client CSS and viewport size. This computation is done by first hiding the document contents, then start adding parts of the document to a page area, and keep adding new document contents until we trigger an overflow in the page area. The document elements that were part of the page area directly before the overflow was triggered are the elements that fit in one page. Continue this algorithm until we have assigned all document elements to pages. Once this is done, we have our page distribution and we can offer users the page reading experience that is the goal of this application.

## Computing the pagination

As mentioned above, computing the pagination is done directly on the client, in the browser, with JavaScript. But before we can dive into the algorithm, we must first have a html structure to support this pagination, a place to put the ebook document contents, a page where we add the text and a page container that is used to detect when overflow is trigerred:

``` html
<body>
    <div id="content"></div>
    <div id="pageContainer" style="visibility: visible;">
        <div id="page" style="font-size: 1.44em !important;"></div>
    </div>
</body>
```

``` css
body {
    overflow: hidden;
    background-color: white;
    color: white;
    padding: 0;
    margin: 0;
}

#content {
    display: none
}

#pageContainer {
    display: block;
    position: fixed;
    width: 80vw;
    left: 10vw;
    height: 100vh;
    top: 0;
    overflow: hidden;
    padding: 0;
    margin: 0;
}

#page {
    color: black;
    font-family: Georgia, serif;
}
```

With this structure in place, we first load the ebook document contents and store them in the `content` div. Then, we can start setting up the pages:

``` js
function setup() {
    computeStartPositionsOfElements(document.getElementById("content"))
    findPages()
    jumpToLocation()
}

function computeStartPositionsOfElements(root) {
    var positionToElement = []
    var idPositions = []

    var recursive = function(element, currentPosition) {
        if (element.nodeType == Node.TEXT_NODE) {
            positionToElement.push([currentPosition, element])
            return currentPosition + element.nodeValue.length
        } else if (element.nodeType == Node.ELEMENT_NODE) {
            if (element.id && element.id != null) {
                idPositions.push([element.id, currentPosition])
            }
            var children = element.childNodes
            var newCurrentPosition = currentPosition
            for (var i = 0; i < children.length; i++) {
                newCurrentPosition = recursive(children[i], newCurrentPosition)
            }
            return newCurrentPosition
        } else {
            return currentPosition
        }
    }

    recursive(root, 0)

    setPositions(positionToElement)
    setIdPositions(idPositions)
}
```

We first need a positioning system on our document. We need to know at what position an element starts and how many positions it occupies. If we have this, we can then say page X starts at position Y and has a length of Z positions. Computing this positions for each element is done recursively over the content. Text is a first class citizen in our ebook, so we focus on finding positions of text nodes. For each text node encountered we store its current position, then we increase the current position with the text node length. We also store positions for elements that have an ID. We can later use the positions of IDs to jump withing the book, to specific chapters for example. Once we have computed all positions of interest we store them in memory for later reference.

``` js
function findPages() {
    var pages = []
    pages.push(0)
    var jump = 100
    while (pages[pages.length - 1] < getMaxPosition()) {
        if (pages.length > 2) jump = pages[pages.length - 1] - pages[pages.length - 2]
        var endPosition = findPage(pages[pages.length - 1], jump)
        pages.push(endPosition)
    }
    clearPage()
    
    document.pages = pages
    document.currentPage = 0
}
```

When we start looking for pages, we start with position 0, that is where our first page starts. We store the pages into an array where every entry in the array stores the start position of the page at that index. We keep adding pages to our array until we have reached the maximum position in the document. When we search for a page, we start with a "jump" value; this means we assume that the page will have the "jump" number of characters in it. We then adjust around this "jump" number, increasing or decreasing it, to find the optimum size of the page. A good assumption is that most pages will contain roughly the same number of characters, so the initial "jump" for the current page will be the size of the previous page.

``` js
function findPage(startPosition, initialJump) {
    var previousEndPosition = null
    var endPosition = findNextSpaceForPosition(startPosition + initialJump)
    copyTextToPage(startPosition, endPosition)
    while ((! scrollNecessary()) && (endPosition < getMaxPosition())) {
        previousEndPosition = endPosition
        endPosition = findNextSpaceForPosition(endPosition + 1)
        copyTextToPage(startPosition, endPosition)
    }
    while (scrollNecessary() && (endPosition > startPosition)) {
        previousEndPosition = endPosition
        endPosition = findPreviousSpaceForPosition(endPosition - 1)
        copyTextToPage(startPosition, endPosition)
    }
    if (endPosition == startPosition) return previousEndPosition
    return endPosition
}
```

Adjusting and validating the size of the page is done in the `findPage` method. We don't want our page to cut words in half, so only positions that contain a space character are considered valid end positions. To find the optimum size of the current page, we keep increasing the page size by adding whole words to it until we trigger a scroll. After triggerring a scroll, we start going back, by removing words. This secondary loop will most of the time get executed only once, on the ocasion when we have overflowed the page by adding a word and now we need to remove that single word to get the correct page size. But sometimes, if the initial jump value is too high, we must remove more than one word to get the right page size. This will most likely happen when the current page includes an image or a table, these structures use up a lot more space than words, so from our positioning system point of view the current page will be a lot smaller than the previous page. At the end of the method, we return the end position we have found. 

In some very few cases we may try to add a single element to the page that triggers the overflow. This may happen with an issue with CSS styles that prevent an image from correctly scaling to the page, for example. In this special case we could end up with an infinite amout of zero-sized pages, so the last `if` in the method above is there to handle this situation. A page size must be larger then zero, and if a single element can't be displayed correctly on that page we accept this defect but try our best to continue with the algorithm.

``` js
function findNextSpaceForPosition(position) {
    var positions = getPositions()
    var i = 0
    while (i < positions.length-1 && positions[i+1][0] < position) i = i + 1

    var el = positions[i][1]
    var p = position - positions[i][0]
    var str = el.nodeValue
    while (p < str.length && str.charAt(p) != ' ') p = p + 1

    if (p >= str.length) {
        if (i == positions.length - 1) return getMaxPosition()
        else return positions[i+1][0]
    } else {
        return positions[i][0] + p
    }
}

function findPreviousSpaceForPosition(position) {
    var positions = getPositions()
    var i = 0
    while (i < positions.length-1 && positions[i+1][0] < position) i = i + 1

    var el = positions[i][1]
    var p = position - positions[i][0]
    if (p == el.nodeValue.length) return positions[i][0] + p
    while (p > 0 && el.nodeValue.charAt(p) != ' ') p = p - 1

    return positions[i][0] + p
}

function scrollNecessary() {
    return document.pageContainer.scrollHeight > document.pageContainer.offsetHeight || document.pageContainer.scrollWidth > document.pageContainer.offsetWidth
}
```

I have added a reference to the helping methods used to find previous and next space positions, as well as the method that checks if we have triggered the overflow. A mention on the space finding methods is that these methods will consider positions between elements as spaces.

``` js
function copyTextToPage(from, to) {
    var positions = getPositions()
    var range = document.createRange()

    var startEl = getElementForPosition(positions, from)
    var startElement = startEl[1]
    var locationInStartEl = from - startEl[0]
    range.setStart(startElement, locationInStartEl)

    var endEl = getElementForPosition(positions, to)
    var locationInEndEl = to - endEl[0]
    range.setEnd(endEl[1], locationInEndEl)

    var page = document.getElementById("page")
    page.innerHTML = ""
    page.appendChild(range.cloneContents())
}

function clearPage() {
    document.getElementById("page").innerHTML = ""
}
```

The `copyTextToPage` method moves text and elements from the `content` storage DIV to the `page` DIV. This method uses the versatile `Range` JavaScript object, supported by all modern browsers, to copy that text along with the HTML structure that contain it. This way, our page will maintain paragraphs, lists, headers, spans that were present in the original ebook document. The `clearPage` method will remove everything from the `page` DIV, to make way for displaying a new page.

``` js
function getPageForId(id) {
    return getPageForPosition(getPositionForId(id))
}

function getPositionForId(id) {
    for (var i = 0; i < document.idPositions.length; i++) {
        if (document.idPositions[i][0] == id) return document.idPositions[i][1]
    }
    return 0
}

function getPageForPosition(position) {
    for (var i = 1; i < document.pages.length - 1; i++) {
        if (document.pages[i] > position) return i-1
    }
    return document.pages.length - 2
}

function jumpToLocation() {
    var url = new URL(window.location.href)
    if (url.href.lastIndexOf("#") > 0) {
        var id = url.href.substring(url.href.lastIndexOf("#") + 1, url.href.length)
        displayPage(getPageForId(id))
    } else if (url.searchParams.get("position")) {
        var pos = parseInt(url.searchParams.get("position"))
        displayPage(getPageForPosition(pos))
    } else {
        displayPage(0)
    }
}
```

Once we have the pages, we can display the desired page with the `jumpToLocation` method. This method will decide on the location based on the URL fragment or URL parameter `position`. We already have all the information necessary to find the right page, computed in the `computeStartPositionsOfElements` method.

``` js
function displayPage(page) {
    if (page >= 0 && page < document.pages.length - 1) {
        document.currentPage = page
        var startPosition = document.pages[page]
        copyTextToPage(startPosition, document.pages[page + 1])
        reportPosition(startPosition)
    }
}
```

And the `displayPage` method finds the start and end positions of the page, based on our pages array, then copies text to the page using the `copyTextToPage` method. Another step we do here is to report the current position in the book back to the server. We do this on every page flip, to store the progress in the book and be able to open the book at the same location the next time the user wants to continue reading it.

This is the whole algorithm for computing and displaying ebook pages in the browser. It's a versatile alorithm, it gives good results most of the time, you can change the styling of the ebook web page (increase margins, paddings) without having to change the algorithm, and the algorithm will work well across browsers, both desktop and mobile (with one small exception, I had to add a special css rule to display a page correctly on the very small screen of an iPhone SE I tested my application on, but no changes to the algorithm were necessary). There are still improvements that can be made, two things that come to my mind at this time is optimizing the jumps in the `findPage` method, only moving one word at a time may be too slow, we may get better results doubling and halving the number of words we add to / remove from the page until we find the optimum page size; the second would be to compute pages in an element with `visibility: hidden` CSS and display the current page as soon as we have it, before the computation of all the pages in the document is complete.

## A small optimization

Besides the improvements I suggested just now, there is one small thing we can do to improve the performance of the application. Computing the ebook pagination on the client, as soon as the ebook content is loaded, can be a lengthy process. For small ebook sections, pagination computation is not noticeable, but there are some ebooks that are organized into very large sections, one section being an HTML file containg tens of chapters. When the pagination for such a section is computed, the algorithm may take a longer time and the browser may even complain and ask the user if they want to stop the backgroung javascript. Going through this algorithm every time the user opens the book on their device will lead to a bad experience for them. But we can use a little trick to limit the amount of times this algorithm has to run: store the pagination results in the browser local storage.

Pagination information depends on the book and the section, but also on the viewport size (resizing the browser on desktop will require recomputing the pagination) and the zoom value, which is what determines the text size in the application. Since these are the variables that pagination depends on, all of them must be part of the key we use for storing the pagination result in the local storage of the browser. With this in mind, the actual `findPages` method looks like:

``` js
function findPages() {
    var pagesKey = getBookId() + "_" + getCurrentSection() + "_" + getViewportWidth() + "_" + getViewportHeight() + "_" + getZoom()
    var savedPages = window.localStorage.getItem(pagesKey)
    if (savedPages) {
        var stringPages = savedPages.split(",")
        var parsedSavedPages = []
        for (var i = 0; i < stringPages.length; i++) {
            parsedSavedPages[i] = parseInt(stringPages[i])
        }
        document.pages = parsedSavedPages
    } else {
        var pages = []
        pages.push(0)
        var jump = 100
        while (pages[pages.length - 1] < getMaxPosition()) {
            if (pages.length > 2) jump = pages[pages.length - 1] - pages[pages.length - 2]
            var endPosition = findPage(pages[pages.length - 1], jump)
            pages.push(endPosition)
        }
        clearPage()
        document.pages = pages
        window.localStorage.setItem(pagesKey, pages)
    }

    document.currentPage = 0
}
```

We start by constructing the `pagesKey`, then check local storage to see if we have already computed the pages for the current book, section, screen size and zoom value. If we have an entry in local storage we must parse the pages array; data stored in local storage is primitive key-values, so the pages array we stored before was stored as a string. If parsing was successful we now have the pagination information and we can display the book. If we don't have an entry in local storage, we must compute the pages and make sure we store the result to local storage.

<video src="pagination_optimization.mp4" controls></video>

With this improvement, the experience of our users is improved, they only have to wait once, on a device, for the pagination to be computed. When reopening the book in a future section, the book will be displayed almost instantaneously because the pagination computation can be skipped.
