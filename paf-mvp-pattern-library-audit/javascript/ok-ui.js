(function () {
  document.addEventListener('focus', function (event) {
    var popup = document.querySelector('.ok-ui-popup.ok-ui-popup--open');

    if (popup && !popup.contains(event.target)) {
      event.stopPropagation();
      popup.querySelector('.ok-ui-card').focus();
    }
}, true);
}());