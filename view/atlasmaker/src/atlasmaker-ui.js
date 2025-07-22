/*! AtlasMaker: User Interface Elements */

/**
 * @page AtlasMaker: User Interface Elements
 */
export const AtlasMakerUI = {

  _fadeOut: (el) => {
    el.style.opacity = 1;

    (function _fade () {
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

    (function _fade () {
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
        if (doFadeOut) {
          me._fadeOut(el);
        }
        resolve();
      }, delay);
    });
  },

  // eslint-disable-next-line max-statements
  dialog: async ({el, message, doFadeOut = true, modal = false, delay = 2000, background = '#333'}) => {
    const me = AtlasMakerUI;
    if (typeof doFadeOut === 'undefined') {
      doFadeOut = true;
    }

    el.innerHTML = message;
    el.style.background = background;
    me._fadeIn(el);

    if (modal) {
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
