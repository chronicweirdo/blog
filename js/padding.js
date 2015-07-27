var MIN_WIDTH = 800;

function setPadding() {
    var clientWidth = document.documentElement.clientWidth;
    var padding = "5%";
    var width = "90%";
    if (clientWidth > MIN_WIDTH) {
      padding = ((clientWidth - 800) / 2) + "px";
      width = MIN_WIDTH + "px";
    }

    $('body').children().each(function(index, child) {
        $(child).css('padding-left', padding);
        $(child).css('padding-right', padding);
        $(child).css('width', width);
    });
}

$(window).load(function() {
    setPadding();
    $(window).resize(setPadding);
});
