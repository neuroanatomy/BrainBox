/**
 * Deep merge with exactly the semantics of jQuery's `$.extend(true, target, ...sources)`
 * (jQuery 3.7.1), so code that relied on it keeps its behaviour without jQuery:
 *  - plain objects are merged recursively, and so are arrays, index by index
 *    (an array is not replaced by a shorter one: extra elements are kept);
 *  - `undefined` values are skipped, `null` is copied;
 *  - objects and arrays from the sources are cloned, never moved into the target;
 *  - `__proto__` keys and self-references are skipped.
 * test/unit/deep-extend.spec.js checks it against jQuery itself.
 *
 * Authored as CommonJS, like embedSizing.js, so that mocha can `require` it.
 */

const fnToString = Function.prototype.toString;
const ObjectFunctionString = fnToString.call(Object);

/**
 * jQuery.isPlainObject
 * @param {*} obj Any value
 * @returns {boolean} True for objects created by {} / new Object() / Object.create(null)
 */
const isPlainObject = (obj) => {
  if (!obj || Object.prototype.toString.call(obj) !== '[object Object]') {
    return false;
  }
  const proto = Object.getPrototypeOf(obj);
  if (!proto) {
    return true;
  }
  const Ctor = Object.prototype.hasOwnProperty.call(proto, 'constructor') && proto.constructor;

  return typeof Ctor === 'function' && fnToString.call(Ctor) === ObjectFunctionString;
};

/**
 * Deep-merge the sources into the target, as `$.extend(true, target, ...sources)` did.
 * @param {object} target The object to modify
 * @param {...object} sources Objects whose properties are merged in, in order
 * @returns {object} The target
 */
// eslint-disable-next-line max-statements
const deepExtend = function (target, ...sources) {
  if (typeof target !== 'object' && typeof target !== 'function') {
    target = {};
  }
  if (target === null) {
    target = {};
  }
  for (const options of sources) {
    // Only deal with non-null/undefined values
    // eslint-disable-next-line no-eq-null, eqeqeq
    if (options == null) { continue; }
    // for...in, as jQuery: inherited enumerable properties are merged too
    // eslint-disable-next-line guard-for-in
    for (const name in options) {
      const copy = options[name];
      // Prevent Object.prototype pollution, and never-ending loops
      if (name === '__proto__' || target === copy) { continue; }
      const copyIsArray = Array.isArray(copy);
      if (copy && (isPlainObject(copy) || copyIsArray)) {
        const src = target[name];
        let clone;
        if (copyIsArray && !Array.isArray(src)) {
          clone = [];
        } else if (!copyIsArray && !isPlainObject(src)) {
          clone = {};
        } else {
          clone = src;
        }
        // Never move original objects, clone them
        target[name] = deepExtend(clone, copy);
      } else if (typeof copy !== 'undefined') {
        // Don't bring in undefined values
        target[name] = copy;
      }
    }
  }

  return target;
};

module.exports = { deepExtend, isPlainObject };
