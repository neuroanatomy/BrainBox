/**
 * Measuring and positioning elements with exactly the semantics of the jQuery 3.7.1
 * calls they replace, for code moving off jQuery:
 *  - cssDimension(el, 'width')   <- $(el).css('width')
 *  - offset(el)                  <- $(el).offset()
 *  - setOffset(el, {left, top})  <- $(el).offset({left, top})
 *  - setStyle(el, props)         <- $(el).css(props)
 * test/integration/geometry.test.js checks them against jQuery itself, in a real
 * browser (jsdom has no layout).
 *
 * Authored as CommonJS, like embedSizing.js, so that it can also be loaded on its own.
 */

// jQuery's cssShow and rdisplayswap: how a display:none element is measured
const cssShow = { position: 'absolute', visibility: 'hidden', display: 'block' };
const rdisplayswap = /^(none|table(?!-c[ea]).+)/;
const rnumnonpx = /^([+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|))(?!px)[a-z%]+$/i;

// jQuery.css(elem, name, true): the number, 0 if not a number
const cssNum = (styles, name) => parseFloat(styles[name]) || 0;

/**
 * jQuery's boxModelAdjustment, for the boxes css('width') can ask for ('content' or 'border')
 * @param {HTMLElement} elem The element
 * @param {string} dimension 'width' or 'height'
 * @param {string} box 'content' or 'border'
 * @param {boolean} isBorderBox Whether the value being adjusted is a border-box size
 * @param {CSSStyleDeclaration} styles Its computed style
 * @param {number} computedVal The value being adjusted
 * @returns {number} What to add to the value
 */
const boxModelAdjustment = (elem, dimension, box, isBorderBox, styles, computedVal) => {
  const sides = dimension === 'width' ? ['Left', 'Right'] : ['Top', 'Bottom'];
  let delta = 0;
  // Adjustment may not be necessary
  if (box === (isBorderBox ? 'border' : 'content')) {
    return 0;
  }
  for (const side of sides) {
    if (!isBorderBox) {
      // a content-box value, seeking the border box: add padding and border
      delta += cssNum(styles, `padding${side}`) + cssNum(styles, `border${side}Width`);
    } else {
      // a border-box value, seeking the content box: subtract padding and border
      delta -= cssNum(styles, `padding${side}`) + cssNum(styles, `border${side}Width`);
    }
  }
  // Account for a positive content-box scroll gutter
  if (!isBorderBox && computedVal >= 0) {
    const offsetSize = elem[`offset${dimension[0].toUpperCase()}${dimension.slice(1)}`];
    delta += Math.max(0, Math.ceil(offsetSize - computedVal - delta - 0.5)) || 0;
  }

  return delta;
};

/**
 * jQuery's getWidthOrHeight, as called by .css('width') (no `extra`, and a browser
 * with reliable box-sizing: the computed value is used as it is)
 * @param {HTMLElement} elem The element
 * @param {string} dimension 'width' or 'height'
 * @returns {string} The size, e.g. '700px'
 */
const getWidthOrHeight = (elem, dimension) => {
  const styles = elem.ownerDocument.defaultView.getComputedStyle(elem);
  const offsetProp = `offset${dimension[0].toUpperCase()}${dimension.slice(1)}`;
  let val = styles[dimension];
  let isBorderBox = false;
  let valueIsBorderBox = false;
  if (rnumnonpx.test(val)) {
    return val;
  }
  // Fall back to offsetWidth/offsetHeight when the value is "auto" (e.g. inside a hidden
  // ancestor, or an inline element), if the element is visible and connected
  if ((val === 'auto' || (!parseFloat(val) && styles.display === 'inline')) && elem.getClientRects().length) {
    isBorderBox = styles.boxSizing === 'border-box';
    valueIsBorderBox = offsetProp in elem;
    if (valueIsBorderBox) {
      val = elem[offsetProp];
    }
  }
  val = parseFloat(val) || 0;

  return `${val + boxModelAdjustment(elem, dimension, isBorderBox ? 'border' : 'content', valueIsBorderBox, styles, val)}px`;
};

/**
 * $(elem).css('width') / .css('height')
 * @param {HTMLElement} elem The element
 * @param {string} dimension 'width' or 'height'
 * @returns {string} The size, e.g. '700px'
 */
const cssDimension = (elem, dimension) => {
  const styles = elem.ownerDocument.defaultView.getComputedStyle(elem);
  // An element hidden by its own display is measured as if shown, as jQuery does
  if (rdisplayswap.test(styles.display) &&
      (!elem.getClientRects().length || !elem.getBoundingClientRect().width)) {
    const old = {};
    for (const name of Object.keys(cssShow)) {
      old[name] = elem.style[name];
      elem.style[name] = cssShow[name];
    }
    const size = getWidthOrHeight(elem, dimension);
    for (const name of Object.keys(cssShow)) {
      elem.style[name] = old[name];
    }

    return size;
  }

  return getWidthOrHeight(elem, dimension);
};

/**
 * $(elem).offset(): the element's border box relative to the document
 * @param {HTMLElement|null} elem The element
 * @returns {object|undefined} { top, left }; {0, 0} for an element without boxes; undefined for null
 */
const offset = (elem) => {
  if (!elem) {
    return;
  }
  // Return zeros for disconnected and hidden (display: none) elements
  if (!elem.getClientRects().length) {
    return { top: 0, left: 0 };
  }
  const rect = elem.getBoundingClientRect();
  const win = elem.ownerDocument.defaultView;

  // eslint-disable-next-line consistent-return
  return { top: rect.top + win.pageYOffset, left: rect.left + win.pageXOffset };
};

/**
 * $(elem).position(): the element's margin box relative to its offset parent's padding box
 * @param {HTMLElement} elem The element
 * @returns {object} { top, left }
 */
// eslint-disable-next-line max-statements
const position = (elem) => {
  const doc = elem.ownerDocument;
  const win = doc.defaultView;
  const styles = win.getComputedStyle(elem);
  let parentOffset = { top: 0, left: 0 };
  let elemOffset;
  if (styles.position === 'fixed') {
    elemOffset = elem.getBoundingClientRect();
  } else {
    elemOffset = offset(elem);
    let offsetParent = elem.offsetParent || doc.documentElement;
    while (offsetParent &&
        (offsetParent === doc.body || offsetParent === doc.documentElement) &&
        win.getComputedStyle(offsetParent).position === 'static') {
      offsetParent = offsetParent.parentNode;
    }
    if (offsetParent && offsetParent !== elem && offsetParent.nodeType === 1) {
      const parentStyles = win.getComputedStyle(offsetParent);
      parentOffset = offset(offsetParent);
      parentOffset.top += cssNum(parentStyles, 'borderTopWidth');
      parentOffset.left += cssNum(parentStyles, 'borderLeftWidth');
    }
  }

  return {
    top: elemOffset.top - parentOffset.top - cssNum(styles, 'marginTop'),
    left: elemOffset.left - parentOffset.left - cssNum(styles, 'marginLeft')
  };
};

/**
 * $(elem).css(props), for properties measured in pixels (left, top, width, height...):
 * a number gets 'px', null/undefined/NaN are skipped, strings are set as they are
 * @param {HTMLElement|null} elem The element (nothing happens for null, as for an empty selection)
 * @param {object} props Property names (camelCase) and values
 * @returns {void}
 */
const setStyle = (elem, props) => {
  if (!elem) { return; }
  for (const [name, value] of Object.entries(props)) {
    // eslint-disable-next-line no-self-compare
    if (value === null || typeof value === 'undefined' || value !== value) { continue; }
    elem.style[name] = typeof value === 'number' ? `${value}px` : value;
  }
};

/**
 * $(elem).offset({left, top}): move the element so that its border box is at these
 * document coordinates, through its CSS left/top (jQuery.offset.setOffset)
 * @param {HTMLElement|null} elem The element (nothing happens for null)
 * @param {object} options { left, top }; either may be omitted
 * @returns {void}
 */
// eslint-disable-next-line max-statements
const setOffset = (elem, options) => {
  if (!elem) { return; }
  const win = elem.ownerDocument.defaultView;
  const pos = win.getComputedStyle(elem).position;
  // Set position first, in case top/left are set even on a static element
  if (pos === 'static') {
    elem.style.position = 'relative';
  }
  const curOffset = offset(elem);
  const styles = win.getComputedStyle(elem);
  const curCSSTop = styles.top;
  const curCSSLeft = styles.left;
  let curTop;
  let curLeft;
  if ((pos === 'absolute' || pos === 'fixed') && (curCSSTop + curCSSLeft).indexOf('auto') > -1) {
    ({ top: curTop, left: curLeft } = position(elem));
  } else {
    curTop = parseFloat(curCSSTop) || 0;
    curLeft = parseFloat(curCSSLeft) || 0;
  }
  const props = {};
  // eslint-disable-next-line no-eq-null, eqeqeq
  if (options.top != null) {
    props.top = (options.top - curOffset.top) + curTop;
  }
  // eslint-disable-next-line no-eq-null, eqeqeq
  if (options.left != null) {
    props.left = (options.left - curOffset.left) + curLeft;
  }
  setStyle(elem, props);
};

module.exports = { cssDimension, offset, position, setOffset, setStyle };
