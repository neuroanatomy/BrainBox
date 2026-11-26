/**
 * Helpers that the MRI page and the project page both had (mri-page.js,
 * project-page.js): an empty-object test, delegated event listeners, and the
 * block that stops a double tap from zooming the page.
 *
 * Authored as CommonJS, like viewLink.js, so that mocha can `require` it.
 */

/**
 * True if the object has no enumerable property, own or inherited
 * @param {object} obj Any object
 * @returns {boolean} Whether it is empty
 */
const isEmptyObject = (obj) => {
  // eslint-disable-next-line guard-for-in, no-unreachable-loop
  for (const name in obj) {
    return false;
  }

  return true;
};

/**
 * Delegated listener: call `handler(event, matched)` for events on `root` whose target
 * is, or is inside, an element of `root` matching `selector`
 * @param {EventTarget} root Where to listen (the document, or an element)
 * @param {string} types Space-separated event types
 * @param {string} selector CSS selector of the elements to watch
 * @param {function} handler Called with the event and the matched element
 * @returns {void}
 */
const delegate = (root, types, selector, handler) => {
  const isDocument = root.nodeType === 9; // Node.DOCUMENT_NODE
  for (const type of types.split(' ')) {
    root.addEventListener(type, (e) => {
      // an element (Node.ELEMENT_NODE): not a text node, the document or the window
      const matched = (e.target && e.target.nodeType === 1) ? e.target.closest(selector) : null;
      if (matched && matched !== root && (isDocument || root.contains(matched))) {
        handler(e, matched);
      }
    });
  }
};

/**
 * Stop a double tap (two one-finger touches less than 500 ms apart) on `elem` from
 * zooming the page, and give back the two clicks it swallows
 * @param {EventTarget} elem Where to listen (the page's body)
 * @param {object} [options] Options
 * @param {function} [options.tapped] event => the element whose last touch is
 *   remembered and that is clicked (default: the touched element, `event.target`)
 * @param {function} [options.click] element => click it (default: `element.click()`)
 * @returns {void}
 */
const preventDoubleTapZoom = (elem, { tapped = (e) => e.target, click = (el) => el.click() } = {}) => {
  const lastTouch = new WeakMap();
  elem.addEventListener('touchstart', (e) => {
    const el = tapped(e);
    const t2 = e.timeStamp;
    const t1 = lastTouch.get(el) || t2;
    const dt = t2 - t1;
    const fingers = e.touches.length;
    lastTouch.set(el, t2);
    if (!dt || dt > 500 || fingers > 1) { return; } // not a double tap
    e.preventDefault(); // a double tap: prevent the zoom
    // and give back the clicks it swallowed
    click(el);
    click(el);
  });
};

module.exports = { isEmptyObject, delegate, preventDoubleTapZoom };
