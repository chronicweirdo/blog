var MIN_WIDTH = 800;

function updatePadding() {
    var setup = computePaddingAndWidth();

    $('body').children().each(function(index, child) {
        $(child).css('padding-left', setup.padding);
        $(child).css('padding-right', setup.padding);
        $(child).css('width', setup.width);
    });
}

function computePaddingAndWidth() {
    var clientWidth = document.documentElement.clientWidth;
    var padding = "5%";
    var width = "90%";
    if (clientWidth > MIN_WIDTH) {
      padding = ((clientWidth - MIN_WIDTH) / 2) + "px";
      width = MIN_WIDTH + "px";
    }

    return { 'padding': padding, 'width': width};
}

function buildDynamicStyle() {
    var style = document.createElement("style");
    style.appendChild(document.createTextNode(""));
    document.head.appendChild(style);
    var setup = computePaddingAndWidth();
    var sheet = style.sheet;
    sheet.insertRule('body > * { padding-left:' + setup.padding + '; padding-right:' + setup.padding + '; width:' + setup.width + '; }', 0);
}

$('head').ready(function() {
    buildDynamicStyle();
    $(window).resize(updatePadding);
});
