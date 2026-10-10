/**
 * show() and hide() with exactly the semantics of jQuery's .show() / .hide()
 * (jQuery 3.7.1, `showHide`), for code moving off jQuery:
 *  - hide() remembers the inline display it overwrites (e.g. 'flex'), and
 *    show() puts it back;
 *  - show() with nothing remembered clears the inline display, and if the
 *    element is then still hidden by a stylesheet, uses its tag's default
 *    display ('block' for a div).
 * Both accept null (and do nothing), as jQuery did for an empty selection.
 * test/unit/show-hide.spec.js checks them against jQuery itself.
 *
 * The remembered values live here, not in jQuery's private store: an element
 * hidden by jQuery's .hide() and shown with this show() (or the reverse) gets
 * the cleared display, not the one remembered by the other.
 *
 * Authored as CommonJS, like embedSizing.js, so that mocha can `require` it.
 */

const savedDisplay = new WeakMap();
const defaultDisplayMap = {};

/**
 * jQuery's getDefaultDisplay: the display a fresh element with the same tag gets
 * @param {HTMLElement} elem An element
 * @returns {string} Its tag's default display, 'block' if that is 'none'
 */
const getDefaultDisplay = (elem) => {
  const doc = elem.ownerDocument;
  const { nodeName } = elem;
  let display = defaultDisplayMap[nodeName];
  if (display) {
    return display;
  }
  const temp = doc.body.appendChild(doc.createElement(nodeName));
  ({ display } = doc.defaultView.getComputedStyle(temp));
  temp.parentNode.removeChild(temp);
  if (display === 'none') {
    display = 'block';
  }
  defaultDisplayMap[nodeName] = display;

  return display;
};

/**
 * jQuery's isHiddenWithinTree
 * @param {HTMLElement} elem An element
 * @returns {boolean} True if hidden by its inline style, or (in the document) by a stylesheet
 */
const isHiddenWithinTree = (elem) => elem.style.display === 'none' ||
  (elem.style.display === '' &&
    elem.ownerDocument.contains(elem) &&
    elem.ownerDocument.defaultView.getComputedStyle(elem).display === 'none');

/**
 * Show an element, as jQuery's .show()
 * @param {HTMLElement|null} elem The element
 * @returns {void}
 */
const show = (elem) => {
  if (!elem || !elem.style) { return; }
  let value = null;
  if (elem.style.display === 'none') {
    value = savedDisplay.get(elem) || null;
    if (!value) {
      elem.style.display = '';
    }
  }
  if (elem.style.display === '' && isHiddenWithinTree(elem)) {
    value = getDefaultDisplay(elem);
  }
  if (value !== null) {
    elem.style.display = value;
  }
};

/**
 * Hide an element, as jQuery's .hide()
 * @param {HTMLElement|null} elem The element
 * @returns {void}
 */
const hide = (elem) => {
  if (!elem || !elem.style) { return; }
  const { display } = elem.style;
  if (display !== 'none') {
    // Remember what we're overwriting
    savedDisplay.set(elem, display);
    elem.style.display = 'none';
  }
};

module.exports = { show, hide };
