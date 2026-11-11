/**
 * The check of the new-project page while a short name is typed: letters, numbers and hyphens,
 * as the server accepts in a new shortname (shared suite 2.6, 2026-11-11; hyphens were refused
 * here). An empty name passes: the page's button stays usable while the field is cleared.
 *
 * Authored as CommonJS, like embedSizing.js, so that mocha can `require` it.
 * @param {string} value The name typed
 * @returns {boolean} True if the name may be used
 */
const isShortnameInput = (value) => (/^[a-zA-Z0-9-]*$/).test(value);

module.exports = { isShortnameInput };
