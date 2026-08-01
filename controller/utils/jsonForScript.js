'use strict';

// Characters that must not survive verbatim into an inline <script> block.
// Built from escapes rather than written literally: U+2028/U+2029 are line
// separators, so a literal copy of them in this source file would break the
// expression it appears in (and be invisible to whoever tried to fix it).
const LINE_SEPARATOR = '\\u2028';
const PARAGRAPH_SEPARATOR = '\\u2029';
const UNSAFE = new RegExp('[<>' + LINE_SEPARATOR + PARAGRAPH_SEPARATOR + ']', 'g');
const ESCAPES = {
  '<': '\\u003c',
  '>': '\\u003e',
  [String.fromCharCode(0x2028)]: '\\u2028',
  [String.fromCharCode(0x2029)]: '\\u2029'
};

/**
 * Serialise a value for injection into an inline <script> block.
 *
 * `JSON.stringify` alone is NOT safe here. HTML parsing happens before
 * JavaScript parsing, so the first literal `</script` in the output closes the
 * script element no matter where it appears - including inside a JSON string
 * value. A reflected query parameter or an MRI/annotation name containing
 * `</script><img src=x onerror=...>` therefore becomes script injection.
 *
 * Escaping `<` and `>` keeps the JSON semantically identical (JSON.parse yields
 * exactly the same value) while making it impossible to end the element or open
 * a comment. U+2028/U+2029 are valid inside JSON strings but are line
 * terminators to older JavaScript parsers, so they go too.
 *
 * @param {*} value Any JSON-serialisable value
 * @returns {string} A string safe to place between <script> and </script>
 */
const jsonForScript = function (value) {
  return JSON.stringify(value).replace(UNSAFE, (c) => ESCAPES[c]);
};

module.exports = { jsonForScript };
