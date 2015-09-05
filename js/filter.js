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
}

$(window).load(function() {
    window.parameters = parseParameters();
    console.log(window.parameters);
    filterPosts();
});
