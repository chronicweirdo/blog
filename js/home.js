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

window.mobilecheck = function() {
  var check = false;
  (function(a){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4)))check = true})(navigator.userAgent||navigator.vendor||window.opera);
  return check;
}

$(window).load(function() {
    setWelcomePadding();
    var isMobile = mobilecheck();
    if (! isMobile) {
        $(window).scroll(scrollFunction);
    }

    $(window).resize(setWelcomePadding);
});

function filterPosts() {
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

function getWindowHeight() {
    var h = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
    return h;
}
function getMaxWelcomePadding() {
    var wh = getWindowHeight();
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
