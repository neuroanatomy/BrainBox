/* global $ */
/*! AtlasMaker: User Interface Elements */

/**
 * @page AtlasMaker: User Interface Elements
 */
export var AtlasMakerUI = {

    /**
     * @function slider
     * @param {object} elem DOM element
     * @param {function} callback Function called after the slider position is updated
     * @returns {void}
     */
    slider: function slider(elem, callback) {
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
    chose: function chose(elem, callback) {
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
    chose3state: function chose3state(elem, callback) {
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
    toggle: function toggle(elem, callback) {
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
    push: function push(elem, callback) {
        // Initialise a 'push' control
        $(elem).click(function() {
            if(callback) {
                return callback();
            }
        });
    }
};
