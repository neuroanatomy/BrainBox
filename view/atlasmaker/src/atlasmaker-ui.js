/* global $ */
/*! AtlasMaker: User Interface Elements */

/**
 * @page AtlasMaker: User Interface Elements
 */
export const AtlasMakerUI = {

  /**
     * @function slider
     * @param {object} elem DOM element
     * @param {function} callback Function called after the slider position is updated
     * @returns {void}
     */
  slider: function (elem, callback) {
    // Initialise a 'slider' control

    $(elem).data({
      drag:false,
      val:0,
      max:100
    });

    var movex = (el, clientX) => {
      if ($(el).data("drag") === true) {
        var R = $(el).find(".track")[0].getBoundingClientRect();
        var x = (clientX-R.left)/R.width;
        if(x<0) { x=0; }
        if(x>1) { x=1; }
        x *= $(el).data("max");
        if(x !== $(el).data("val")) {
          const max=$(el).data("max");
          $(el).data("val", x);
          $(el).find(".thumb")[0].style.left=(x*100/max)+"%";

          return callback(x);
        }
      }
    };

    var updateDisplay = () => {
      const val=$(elem).data("val");
      const max=$(elem).data("max");
      const [thumb] = $(elem).find(".thumb");
      thumb.style.left = (val*100/max) + "%";
    };

    $(document).on("mousemove", (ev) => { movex(elem, ev.clientX); });
    $(document).on("touchmove", (ev) => { movex(elem, ev.originalEvent.changedTouches[0].pageX); });
    $(document).on("mouseup touchend", () => { $(elem).data({drag:false}); });
    $(elem).on('mousedown touchstart', () => { $(elem).data({drag:true}); });
    $(elem).on('updateDisplay', () => { updateDisplay(); });
  },

  /**
     * @function chose
     * @param {object} elem DOM element
     * @param {function} callback Function called after a button is pressed
     * @returns {void}
     */
  chose: function (elem, callback) {
    // Initialise a 'chose' control
    var ch=$(elem).find(".a");
    ch.each(function(c, d) {
      $(d).click(function() {
        if($(d).hasClass("pressed")) {
          return callback($(d).attr('title'));
        }
        ch.each(function(c1, d1) { $(d1).removeClass("pressed"); });
        $(d).addClass("pressed");
        if(callback) {
          return callback($(d).attr('title'));
        }
      });
    });
  },

  /**
     * @function chose3state
     * @param {object} elem DOM element
     * @param {function} callback Function called after a button is pressed
     * @returns {void}
     */
  chose3state: function (elem, callback) {
    // Initialise a 'chose3state' control
    var ch=$(elem).find(".a");
    ch.each(function(c, d) {
      $(d).click(function() {
        if($(d).hasClass("pressed")) {
          $(d).removeClass("pressed");

          return callback("none");
        }
        ch.each(function(c1, d1) { $(d1).removeClass("pressed"); });
        $(d).addClass("pressed");
        if(callback) {
          return callback($(d).attr('title'));
        }
      });
    });
  },

  /**
     * @function toggle
     * @param {object} elem DOM element
     * @param {function} callback Function called after the slider position is updated
     * @returns {void}
     */
  toggle: function (elem, callback) {
    // Initialise a 'toggle' control
    $(elem).click(function() {
      if($(elem).hasClass("pressed")) {
        $(elem).removeClass("pressed");
      } else {
        $(elem).addClass("pressed");
      }
      if(callback) {
        return callback($(elem).hasClass("pressed"));
      }
    });
  },

  /**
     * @function push
     * @param {object} elem DOM element
     * @param {function} callback Function called after the slider position is updated
     * @returns {void}
     */
  push: function (elem, callback) {
    // Initialise a 'push' control
    $(elem).click(function() {
      if(callback) {
        return callback();
      }
    });
  },

  _fadeOut: (el) => {
    el.style.opacity = 1;

    (function _fade() {
      if ((el.style.opacity -= 0.1) < 0) {
        el.style.display = "none";
      } else {
        requestAnimationFrame(_fade);
      }
    }());
  },

  _fadeIn: (el) => {
    el.style.opacity = 0;
    el.style.display = "block";

    (function _fade() {
      var val = parseFloat(el.style.opacity);
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

  dialog: async ({el, message, doFadeOut=true, modal=false, delay=2000, background="#333"}) => {
    const me = AtlasMakerUI;
    if(typeof doFadeOut === "undefined") {
      doFadeOut = true;
    }

    el.innerHTML = message;
    el.style.background = background;
    me._fadeIn(el);

    if(modal) {
      const back = document.createElement("div");
      back.style = `position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); pointer-events:none`;
      document.body.append(back);

      const okButton = document.createElement("button");
      okButton.textContent = "OK";
      okButton.style = "background: none";
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
