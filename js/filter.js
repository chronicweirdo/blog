function parseParameters() {
    var parameters = window.location.search.replace("?", "");
    var parameterList = parameters.split('&');
    var parameterMap = {};
    parameterList.forEach(function(item) {
        var tmp = item.split("=");
        var name = tmp[0];
        var value = decodeURIComponent(tmp[1]);

        if (parameterMap[name] == undefined) {
            parameterMap[name] = [];
        }
        parameterMap[name].push(value);
    });
    return parameterMap;
}

function filterPosts() {
  if (window.parameters["search"] != undefined) {

      var token = window.parameters["search"][0];

      var newIndex = 0;
      $('.post').each(function(index, post){
        var matches = false;
        var title = $('h1', post).text();
        if(title.contains(' ' + token + ' ')
            || title.startsWith(token + ' ')
            || title.endsWith(' ' + token)
            || title === token) {
          matches = true;
        } else {
          $('span.tag', post).each(function(index, tagEl) {
            if($(tagEl).text() === token) {
              matches = true;
            }
          });
        }

        $(post).removeClass("odd");
        $(post).removeClass("even");
        if (matches) {
          $(post).css('display', 'block');
          $(post).addClass(newIndex % 2 == 0 ? 'even' : 'odd');
          newIndex++;
        } else {
          $(post).css('display', 'none');
        }
      });
  }
}

$(window).load(function() {
    window.parameters = parseParameters();
    filterPosts();
});
