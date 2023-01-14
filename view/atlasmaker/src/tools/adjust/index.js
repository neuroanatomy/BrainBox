/* global AtlasMakerWidget $ */
import html from './index.html';

// append HTML
const el = document.createElement('div');
el.id = 'adjust';
el.style.width = 'calc(100% - 20px )';
el.style.position = 'absolute';
el.style.bottom = 0;
el.style.left = 0;
el.style.padding = '10px';

el.innerHTML = html;
AtlasMakerWidget.container.querySelector('#resizable').appendChild(el);

// Transparency
AtlasMakerWidget.slider($('.slider#alphaLevel'), function (x) {
  $('#alphaLevel').data('val', x);
  $('#alphaLevel .thumb')[0].style.left = x + '%';
  AtlasMakerWidget.alphaLevel = x / 100;
  AtlasMakerWidget.drawImages();
});
$('.slider#alphaLevel').data({ max: 100, val: 50 });
$('#alphaLevel .thumb')[0].style.left = (AtlasMakerWidget.alphaLevel * 100) + '%';

// Brightness
AtlasMakerWidget.slider($('.slider#minLevel'), function (x) {
  $('#minLevel').data('val', x);
  $('#minLevel .thumb')[0].style.left = x + '%';

  const b = (2 * x / 100);
  const c = (2 * $('#maxLevel').data('val') / 100);
  $('#canvas').css({
    'webkit-filter': 'brightness(' + b + ') contrast(' + c + ')',
    'filter': 'brightness(' + b + ') contrast(' + c + ')'
  });
});
$('.slider#minLevel').data({ max: 100, val: 50 });
$('#minLevel .thumb')[0].style.left = '50%';

// Contrast
AtlasMakerWidget.slider($('.slider#maxLevel'), function (x) {
  $('#maxLevel').data('val', x);
  $('#maxLevel .thumb')[0].style.left = x + '%';

  const b = (2 * $('#minLevel').data('val') / 100);
  const c = (2 * x / 100);
  $('#canvas').css({
    'webkit-filter': 'brightness(' + b + ') contrast(' + c + ')',
    'filter': 'brightness(' + b + ') contrast(' + c + ')'
  });
});
$('.slider#maxLevel').data({ max: 100, val: 50 });
$('#maxLevel .thumb')[0].style.left = '50%';

const observer = new MutationObserver(function (mutations) {
  mutations.forEach(function (mutation) {
    if (mutation.attributeName === 'class') {
      console.log('mutation', mutation);
      const attributeValue = $(mutation.target).prop(mutation.attributeName);
      if (attributeValue === 'a sub') {
        $('#adjust').remove();
      }
      observer.disconnect();
      // delete observer;
    }
  });
});
observer.observe($('#paintTool [title="Adjust"]')[0], {
  attributes: true
});
