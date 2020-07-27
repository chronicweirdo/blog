# Gesture navigation in comic books

- about the new app

In the last couple if months I've spent some of
my time on a very specific project: develop a 
web-based cross-device comic, and eventually ebook, 
reader app than gives me access to my comics and 
books collection from anywhere. After many hours
of implementation and testing, the project is a
success and it is released [here](www).

After implementing the reading and display of comic book files, which 

A very important part of the experience of reading comics on a web-app are the controls. They must be simple, minimalistic, and intuitive. It's also important for the controls to be adapted to the device used to read the comic. When on a mobile or tablet device, users interact with a web page using their finges, and there is already a natural array of gestures that get used everywhere, pinch gestures for zooming, panning for moving objects on screen. On a desktop computer, a mouse is used most of the time, sometimes the keyboard. I have implemented support for both kinds of devices and tested and tuned their usage over several weeks.

In the end, the following functionality proved the required set for creating a good experience with the app:

- moving between pages and views: if the whole page fits into the screen, we move between pages; if the page is zoomed and does not fit, this gesture will take us to the next or previous part of the screen
- zooming the image
- moving the image
- opening a menu

## Moving between pages and views (next/previous gestures)

If the whole page fits into the screen, this gesture will move us between pages. If the page is zoomed in and a full page does not fit into the screen, this gesture will take us to the next or previous part of the screen that is not currently visible. The application is currently designed for western media, so the reading order is assumed to be left to right, top to bottom. A zoomed in page can be considered to be composed of multiple views, as presented in the image below.

![page views]()

The next and previous gestures move users between these views. When the top-left view is displayed, the previous gesture will move to the previous page, and similar with the bottom-right view moving to the next page.

![controls]()

The controls for these gestures are on the left and right edges of the screen, as shown in the above image. Clicking with the mouse, a left click, or tapping the areas with your fingers on a mobile device will move you between views and pages.

The UI for the controls is built from the following DIVs: `prev` and `next` representing the areas triggering the previous and next gestures, the tools bottons, placed on both the left and side of the screen, and a central area named `canv` which will be the trigger area for some of the gestures detailed in the next sections.

``` html
<div id="prev"></div>
<div id="next"></div>
<div id="toolsButtonLeft"></div>
<div id="toolsButtonRight"></div>
<div id="canv"></div>
```

The distribution on page of the UI is done with CSS, using the following code:

``` css
#prev, #next, #toolsButtonLeft, #toolsButtonRight, #canv {
    display: block;
    position: fixed;
}
#prev {
    top: 0;
    left: 0;
    width: 10vw;
    height: 90vh;
}
#next {
    top: 0;
    right: 0;
    width: 10vw;
    height: 90vh;
}
#toolsButtonLeft {
    bottom: 0;
    left: 0;
    width: 10vw;
    height: 10vh;
}
#toolsButtonRight {
    bottom: 0;
    right: 0;
    width: 10vw;
    height: 10vh;
}

#canv {
    top: 0;
    left: 10vw;
    width: 80vw;
    height: 100vh;
}
```

Gestures are enabled on our elements with the following javascript:

``` js
enableGesturesOnElement(document.getElementById("prev"), {
    "clickAction": (x, y) => goToPreviousView(),
    "doubleClickAction": zoomJump,
    "mouseMoveAction": mouseGestureDrag,
    "scrollAction": mouseGestureScroll,
    "pinchStartAction": touchGesturePinchStart,
    "pinchAction": touchGesturePinchOngoing,
    "panAction": touchGesturePan
})
enableGesturesOnElement(document.getElementById("next"), {
    "clickAction": (x, y) => goToNextView(),
    "doubleClickAction": zoomJump,
    "mouseMoveAction": mouseGestureDrag,
    "scrollAction": mouseGestureScroll,
    "pinchStartAction": touchGesturePinchStart,
    "pinchAction": touchGesturePinchOngoing,
    "panAction": touchGesturePan
})
```

The previous and next actions are controlled through the click action, but some other actions, related to zooming and panning, are defined on these elements as well. This is done to provide the largest possible action area for touch gestures.

``` js
function goToNextView() {
    if (isEndOfRow()) {
        if (isEndOfColumn()) {
            goToNextPage()
        } else {
            setImageLeft(getNextPosition(getImage().width, getViewportWidth(), getImageLeft(), getHorizontalJumpPercentage(), getRowThreshold()))
            setImageTop(getNextPosition(getImage().height, getViewportHeight(), getImageTop(), getVerticalJumpPercentage(), getColumnThreshold()))
            updateImage()
        }
    } else {
        setImageLeft(getNextPosition(getImage().width, getViewportWidth(), getImageLeft(), getHorizontalJumpPercentage(), getRowThreshold()))
        updateImage()
    }
}
function isEndOfRow() {
    return (getImage().width <= getViewportWidth()) || approx(getImageLeft() + getImageWidth(), getViewportWidth(), getRowThreshold())
}
function isEndOfColumn() {
    return (getImage().height <= getViewportHeight()) || approx(getImageTop() + getImageHeight(), getViewportHeight(), getColumnThreshold())
}
function getNextPosition(imageDimension, viewportDimension, imageValue, viewportJumpPercentage, threshold) {
    if (approx(imageValue, viewportDimension - imageDimension, threshold)) return 0
    var proposedNextPosition = (imageValue - viewportDimension *  viewportJumpPercentage) | 0
    if (proposedNextPosition < viewportDimension - imageDimension) return viewportDimension - imageDimension
    return proposedNextPosition
}
function approx(val1, val2, threshold = 1) {
    return Math.abs(val1 - val2) < threshold
}
```

When moving to the next view, we check if we are at the end of a rown and at the end of a column. If both conditions are true, it's time to load and display the next page. Otherwise, the image is moved on the screen so the next view in the current image is displayed. If we don't have to change the row, only the left position of the image is changed, otherwise both the top and the left positions are adjusted. `getNextPosition` is a generalized method to compute the next vertical or horizontal position based on the dimensions of the image, the viewport dimension (height or width of the screen) and the current position of the image. All computations include a threhold, this allows a move to a next position even when the right edge of the screen is not necessarily in view and improves the user experience. We have similar methods for the previous gesture.

``` js
function enableGesturesOnElement(element, actions) {
    enableTouchGestures(
        element,
        actions.pinchStartAction,
        actions.pinchAction,
        actions.pinchEndAction,
        actions.panAction,
        actions.panEndAction
    )
    element.addEventListener("wheel", (event) => mouseWheelScroll(event, actions.scrollAction, actions.scrollEndAction))
    element.addEventListener("mousedown", mouseDown)
    element.addEventListener("mouseup", (event) => mouseUp(event, actions.clickAction, actions.doubleClickAction, actions.tripleClickAction))
    element.addEventListener("mouseout", mouseUp)
    element.addEventListener("mousemove", (event) => mouseMove(event, actions.mouseMoveAction))
}
```

The code that enables gestures on an element will add different event listeners to monitor what events are getting triggered on the element. For the previous and next actions, we are monitoring mouse clicks (which also capture tap gestures on mobile devices).

``` js
function mouseDown(event, callback) {
    if (event.button == 0) {
        //event.preventDefault()
        gestures.mouseDownX = event.clientX
        gestures.mouseDownY = event.clientY
        gestures.mousePressed = true

        if (callback) callback(event.clientX, event.clientY)
    }
}

function mouseUp(event, clickAction, doubleClickAction, tripleClickAction) {
    if (event.button == 0) {
        gestures.mousePressed = false
        if (gestures.mouseDownX == event.clientX && gestures.mouseDownY == event.clientY) {
            // the mouse did not move, it's a click
            click(event, clickAction, doubleClickAction, tripleClickAction)
        }
    }
}

function click(event, clickAction, doubleClickAction, tripleClickAction) {
    event.preventDefault()
    var timestamp = + new Date()
    gestures.clickTimestamp.push(timestamp)
    delayed(function() {
        if (gestures.clickTimestamp.length > 2) {
            gestures.clickTimestamp = []
            if (tripleClickAction != null) tripleClickAction(event.clientX, event.clientY)
        } else if (gestures.clickTimestamp.length > 1) {
            gestures.clickTimestamp = []
            if (doubleClickAction != null) doubleClickAction(event.clientX, event.clientY)
        } else if (gestures.clickTimestamp.length > 0) {
            gestures.clickTimestamp = []
            if (clickAction != null) clickAction(event.clientX, event.clientY)
        }
        gestures.clickTimestamp.shift()
    })
}

function delayed(callback) {
    window.setTimeout(callback, 250)
}
```

A simple click is the mouse button being pressed and released without the mouse moving. If multiple clicks happen within a time threshold, we have double and triple clicks. Counting the number of clicks is achieved by using a queue. When a click is registered, the timestamp when that click was registered is pushed to the queue. Then a delayed task is triggered which checks the number of timestamps in the queue. Depending on that number, we have a simple, a double or a triple click. The queue is cleared after a click is processed. In practice, we don't use the triple click functionality because it would make using the app too complicated. The double click is used for the zoom functionality and discussed in its section.

Keyboard gestures are enabled with the following javascript:

``` js
enableKeyboardGestures({
    "upAction": () => pan(0, getViewportHeight() / 2),
    "downAction": () => pan(0, - (getViewportHeight() / 2)),
    "leftAction": goToPreviousView,
    "rightAction": goToNextView
})

function enableKeyboardGestures(actions) {
    document.onkeydown = function(e) {
        if (e.keyCode == '38' || e.keyCode == '87') {
            // up arrow or w
            if (actions.upAction) actions.upAction()
        }
        else if (e.keyCode == '40' || e.keyCode == '83') {
            // down arrow or s
            if (actions.downAction) actions.downAction()
        }
        else if (e.keyCode == '37' || e.keyCode == '65') {
            // left arrow or a
            if (actions.leftAction) actions.leftAction()
        }
        else if (e.keyCode == '39' || e.keyCode == '68') {
            // right arrow or d
            if (actions.rightAction) actions.rightAction()
        }
    }
}
```



## Zooming the page

Zooming is a simple concept, it will allow the user to increase the size of the image and see more details, as well as read the text easier. The minimum zoom for a page depends on the size of the page, when the whole page fits the screen, the viewport, the image can't be zoomed out anymore. The application does not currently have a maximum zoom value. If you have a mouse, you can zoom in or out with the scroll wheel. On a device with a touch screen, the pinch gesture can be used to zoom the page.
