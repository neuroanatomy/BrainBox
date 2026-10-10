/* global AtlasMakerWidget */
import { getData, setData } from '../../../../shared/domData.js';
import html from './index.html';

/**
 * Apply brightness and contrast to the MRI canvas
 * (`-webkit-filter` is only an alias of `filter` in current browsers)
 * @param {number} b Brightness, 1 for unchanged
 * @param {number} c Contrast, 1 for unchanged
 * @returns {void}
 */
const setCanvasFilter = (b, c) => {
  document.getElementById('canvas').style.filter = 'brightness(' + b + ') contrast(' + c + ')';
};

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
AtlasMakerWidget.slider(document.getElementById('alphaLevel'), function (x) {
  const alphaLevelElem = document.getElementById('alphaLevel');
  setData(alphaLevelElem, {val: x});
  alphaLevelElem.querySelector('.thumb').style.left = x + '%';
  AtlasMakerWidget.alphaLevel = x / 100;
  AtlasMakerWidget.drawImages();
});

{
  const alphaLevelElem = document.getElementById('alphaLevel');
  setData(alphaLevelElem, { max: 100, val: 50 });
  alphaLevelElem.querySelector('.thumb').style.left = (AtlasMakerWidget.alphaLevel * 100) + '%';
}

// Brightness
AtlasMakerWidget.slider(document.getElementById('minLevel'), function (x) {
  const minLevelElem = document.getElementById('minLevel');
  setData(minLevelElem, {val: x});
  minLevelElem.querySelector('.thumb').style.left = x + '%';

  const b = (2 * x / 100);
  const maxLevel = document.getElementById('maxLevel');
  const c = (2 * getData(maxLevel, 'val') / 100);
  setCanvasFilter(b, c);
});

{
  const minLevelElem = document.getElementById('minLevel');
  setData(minLevelElem, { max: 100, val: 50 });
  minLevelElem.querySelector('.thumb').style.left = '50%';
}

// Contrast
AtlasMakerWidget.slider(document.getElementById('maxLevel'), function (x) {
  const maxLevelElem = document.getElementById('maxLevel');
  setData(maxLevelElem, {val: x});
  maxLevelElem.querySelector('.thumb').style.left = x + '%';

  const minLevel = document.getElementById('minLevel');
  const b = (2 * getData(minLevel, 'val') / 100);
  const c = (2 * x / 100);
  setCanvasFilter(b, c);
});

{
  const maxLevelElem = document.getElementById('maxLevel');
  setData(maxLevelElem, { max: 100, val: 50 });
  maxLevelElem.querySelector('.thumb').style.left = '50%';
}

const observer = new MutationObserver(function (mutations) {
  mutations.forEach(function (mutation) {
    if (mutation.attributeName === 'class') {
      console.log('mutation', mutation);
      // jQuery's .prop('class') was the element's className
      const attributeValue = mutation.target.className;
      if (attributeValue === 'a sub') {
        const panel = document.getElementById('adjust');
        if (panel) { panel.remove(); }
      }
      observer.disconnect();
      // delete observer;
    }
  });
});
observer.observe(document.querySelector('#paintTool [title="Adjust"]'), {
  attributes: true
});
