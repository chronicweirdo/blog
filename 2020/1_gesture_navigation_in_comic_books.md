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
