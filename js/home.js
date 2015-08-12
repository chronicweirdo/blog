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
    setWelcomePadding();
    $(window).scroll(scrollFunction);
    jQuery(window).on("scrollstart", scrollFunction);
    jQuery(window).on("scrollstop", scrollFunction);
    $(window).resize(setWelcomePadding);

    $("#searchField").on('change keyup paste', function() {
        delay(function() {
            filterPosts();
        }, 1000);
    });
});

function filterPosts() {
  //var searchTokens = $("#searchField").val().split(" ");
  var token = $("#searchField").val();

  $('.post').each(function(index, post){
    var matches = false;
    if($('h1', post).text().contains(token)) {
      matches = true;
    } else {
      $('span.tag', post).each(function(index, tagEl) {
        if($(tagEl).text().contains(token)) {
          matches = true;
        }
      });
    }

    if (matches) {
      $(post).css('display', 'block');
    } else {
      $(post).css('display', 'none');
    }
  });
}

function pageEndReached() {
    return ($(window).height() + $(document).scrollTop() >= $(document).height());
}

function scrollFunction() {
    setWelcomePadding();
}

function getMaxWelcomePadding() {
    var wh = document.documentElement.clientHeight;//$(window).height();
    var dh = $(".welcome").height();

    var pad = (wh - dh) / 2;
    return pad;
}

function getMinWelcomePadding() {
    return 24;
}

function setWelcomePadding() {
    var maxLogoPadding = getMaxWelcomePadding();
    var minLogoPadding = getMinWelcomePadding();

    $(".welcome").css("padding-top", maxLogoPadding + "px");
    var pad = maxLogoPadding - $(document).scrollTop();
    if (pad <= minLogoPadding) {
        $(".welcome").css("padding-bottom", minLogoPadding + "px");
    } else {
        $(".welcome").css("padding-bottom", pad + "px");
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
