/*! AtlasMaker: User Interface Elements */

import { getData, setData } from '../../shared/domData.js';

/**
 * @function unwrap
 * @description Unwrap a jQuery object to a raw DOM element, if needed
 * @param {object} el The object to unwrap
 * @returns {object} The unwrapped object
 */
const unwrap = (el) => ((el && el.jquery) ? el[0] : el);

/**
 * @page AtlasMaker: User Interface Elements
 */
export const AtlasMakerUI = {

  /**
     * @function slider
     * @description Initialise a 'slider' control
     * @param {object} elem DOM element
     * @param {function} callback Function called after the slider position is updated
     * @returns {void}
     */
  slider: function (elem, callback) {
    elem = unwrap(elem);
    if (!elem) { return; }
    setData(elem, { drag: false, val: 0, max: 100 });

    const movex = (el, clientX) => {
      if (getData(el, 'drag') === true) {
        const R = el.querySelector('.track').getBoundingClientRect();
        let x = (clientX-R.left)/R.width;
        if(x<0) { x=0; }
        if(x>1) { x=1; }
        x *= getData(el, 'max');
        if(x !== getData(el, 'val')) {
          const max=getData(el, 'max');
          setData(el, { val: x });
          el.querySelector('.thumb').style.left = (x * 100 / max) + '%';

          return callback(x);
        }
      }
    };

    const updateDisplay = () => {
      const val = getData(elem, 'val');
      const max = getData(elem, 'max');
      const thumb = elem.querySelector('.thumb');
      thumb.style.left = (val*100/max) + '%';
    };

    document.addEventListener('mousemove', (ev) => { movex(elem, ev.clientX); });
    document.addEventListener('touchmove', (ev) => { movex(elem, ev.changedTouches[0].pageX); });
    document.addEventListener('mouseup', () => { setData(elem, { drag: false }); });
    document.addEventListener('touchend', () => { setData(elem, { drag: false }); });
    elem.addEventListener('mousedown', (ev) => { ev.preventDefault(); setData(elem, { drag: true }); });
    elem.addEventListener('touchstart', (ev) => { ev.preventDefault(); setData(elem, { drag: true }); });
    elem.addEventListener('updateDisplay', () => { updateDisplay(); });
  },

  /**
     * @function chose
     * @description Initialise a 'chose' control
     * @param {object} elem DOM element
     * @param {function} callback Function called after a button is pressed
     * @returns {void}
     */
  chose: function (elem, callback) {
    elem = unwrap(elem);
    if (!elem) { return; }
    const ch = elem.querySelectorAll('.a');
    ch.forEach((d) => {
      d.addEventListener('click', () => {
        if (d.classList.contains('pressed')) {
          return callback(d.getAttribute('title'));
        }
        ch.forEach((d1) => { d1.classList.remove('pressed'); });
        d.classList.add('pressed');
        if(callback) {
          return callback(d.getAttribute('title'));
        }
      });
    });
  },

  /**
     * @function chose3state
     * @description Initialise a 'chose3state' control
     * @param {object} elem DOM element
     * @param {function} callback Function called after a button is pressed
     * @returns {void}
     */
  chose3state: function (elem, callback) {
    elem = unwrap(elem);
    if (!elem) { return; }
    const ch = elem.querySelectorAll('.a');
    ch.forEach((d) => {
      d.addEventListener('click', () => {
        if (d.classList.contains('pressed')) {
          d.classList.remove('pressed');

          return callback('none');
        }
        ch.forEach((d1) => { d1.classList.remove('pressed'); });
        d.classList.add('pressed');
        if (callback) {
          return callback(d.getAttribute('title'));
        }
      });
    });
  },

  /**
     * @function toggle
     * @description Initialise a 'toggle' control
     * @param {object} elem DOM element
     * @param {function} callback Function called after the slider position is updated
     * @returns {void}
     */
  toggle: function (elem, callback) {
    elem = unwrap(elem);
    if (!elem) { return; }
    elem.addEventListener('click', () => {
      elem.classList.toggle('pressed');
      if (callback) {
        return callback(elem.classList.contains('pressed'));
      }
    });
  },

  /**
     * @function push
     * @description Initialise a 'push' control, with 200ms throttle
     * @param {object} elem DOM element
     * @param {function} callback Function called after the slider position is updated
     * @returns {void}
     */
  push: function (elem, callback) {
    elem = unwrap(elem);
    if (!elem) { return; }
    let lastClickTime = 0;
    elem.addEventListener('click', () => {
      const now = Date.now();
      if(now - lastClickTime < 200) { return; }
      lastClickTime = now;
      if(callback) {
        return callback();
      }
    });
  },

  _fadeOut: (el) => {
    el.style.opacity = 1;

    (function _fade() {
      if ((el.style.opacity -= 0.1) < 0) {
        el.style.display = 'none';
      } else {
        requestAnimationFrame(_fade);
      }
    }());
  },

  _fadeIn: (el) => {
    el.style.opacity = 0;
    el.style.display = 'block';

    (function _fade() {
      let val = parseFloat(el.style.opacity);
      if (!((val += 0.1) > 1)) {
        el.style.opacity = val;
        requestAnimationFrame(_fade);
      }
    }());
  },

  _closeDialog: async (delay, doFadeOut, el) => {
    const me = AtlasMakerUI;
    await new Promise((resolve) => {
      setTimeout(() => {
        if(doFadeOut) {
          me._fadeOut(el);
        }
        resolve();
      }, delay);
    });
  },

  // eslint-disable-next-line max-statements
  dialog: async ({el, message, doFadeOut=true, modal=false, delay=2000, background='#333'}) => {
    const me = AtlasMakerUI;
    if(typeof doFadeOut === 'undefined') {
      doFadeOut = true;
    }

    el.innerHTML = message;
    el.style.background = background;
    me._fadeIn(el);

    if(modal) {
      const back = document.createElement('div');
      back.style = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); pointer-events:all; z-index:19';
      document.body.append(back);

      const okButton = document.createElement('button');
      okButton.textContent = 'OK';
      okButton.style = 'background: none';
      el.appendChild(okButton);
      await new Promise((resolve) => {
        okButton.addEventListener('click', () => {
          back.remove();
          resolve();
        });
      });
    }

    await me._closeDialog(delay, doFadeOut, el);
  }
};
