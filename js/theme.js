---
---

var DEFAULT_THEME = 'light';

function setThemeCss(theme) {
  $('#theme').attr('href', {{ "/css/" | prepend: site.baseurl }} + theme + ".css");
}

function getTheme() {
  var theme = Cookies.get('theme');
  if (theme == undefined) {
    return DEFAULT_THEME;
  } else {
    return theme;
  }
}

function loadTheme() {
  setThemeCss(getTheme());
}

function flipTheme() {
  var current = getTheme();
  if (current == 'light') {
    Cookies.set('theme', 'dark');
  } else if (current == 'dark') {
    Cookies.set('theme', 'light');
  }
  loadTheme();
}

$(document).ready(function() {
  loadTheme();
});
