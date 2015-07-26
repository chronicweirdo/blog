var postsRequest = null;
var pageSize = 5;
var everythingLoaded = false;
var delay = (function(){
    var timer = 0;
    return function(callback, ms){
        clearTimeout (timer);
        timer = setTimeout(callback, ms);
    };
})();

$(window).load(function() {
    setLogoPadding();
    $(window).scroll(scrollFunction);
    $(window).resize(setLogoPadding);
});

function pageEndReached() {
    return ($(window).height() + $(document).scrollTop() >= $(document).height());
}

function scrollFunction() {
    setLogoPadding();
}

function getMaxLogoPadding() {
    var wh = document.documentElement.clientHeight;//$(window).height();
    var dh = $("div.logo").height();

    var pad = (wh - dh) / 2;
    return pad;
}

function getMinLogoPadding() {
    return 24;
}

function setLogoPadding() {
    var maxLogoPadding = getMaxLogoPadding();
    var minLogoPadding = getMinLogoPadding();

    $("div.logo").css("padding-top", maxLogoPadding + "px");
    var pad = maxLogoPadding - $(document).scrollTop();
    if (pad <= minLogoPadding) {
        $("div.logo").css("padding-bottom", minLogoPadding + "px");
    } else {
        $("div.logo").css("padding-bottom", pad + "px");
    }
}

function loadPosts(fromStart) {
    if (postsRequest != null) {
        postsRequest.abort();
    }

    var searchTokens = $("#searchField").val().split(" ");

    var loadedPosts = 0;
    if (! fromStart) {
        loadedPosts = $("div.post").length;
    }

    postsRequest = $.ajax({
        url: "search",
        cache: false,
        data: { search: searchTokens, start: loadedPosts, size: pageSize }
    }).done(function (posts) {
        postsRequest = null;
        if (fromStart) {
            $("div.post").remove();
        }
        var source = $("#postTemplate").html();
        var template = Handlebars.compile(source);
        if (posts.length < pageSize) {
            everythingLoaded = true;
        }
        $.each(posts, function(index, post) {
            post.zebra = getZebra();
            var html = template(post);
            $("body").append(html);
        });
    })
};

function getZebra() {
    if ($("div.post:last").length > 0) {
        var classes = $("div.post:last").attr("class");
        if (classes.lastIndexOf(' odd') != -1) {
            return "even";
        } else {
            return "odd";
        }
    } else {
        return "even";
    }
}
