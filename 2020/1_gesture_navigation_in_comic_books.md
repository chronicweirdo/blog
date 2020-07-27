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

