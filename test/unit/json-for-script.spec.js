const { assert } = require('chai');
const { jsonForScript } = require('../../controller/utils/jsonForScript');

// Built from char codes, never written literally: a literal U+2028 in a source
// file is an invisible line terminator that breaks the expression holding it.
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

describe('jsonForScript: ', function () {
  it('should not let a value close the script element', function () {
    const out = jsonForScript({ x: '</script><img src=x onerror=alert(1)>' });
    assert.notInclude(out.toLowerCase(), '</script');
  });

  it('should escape every angle bracket, wherever it appears', function () {
    const out = jsonForScript({ a: '<b>', c: ['<', '>'], '<key>': 1 });
    assert.notInclude(out, '<');
    assert.notInclude(out, '>');
  });

  it('should escape the start of an HTML comment', function () {
    // <!-- inside a script element starts a comment-like state in the HTML
    // parser, which can swallow the rest of the page.
    const out = jsonForScript({ x: '<!--' });
    assert.notInclude(out, '<!--');
  });

  it('should escape U+2028 and U+2029', function () {
    const out = jsonForScript({ x: 'a' + LINE_SEPARATOR + 'b' + PARAGRAPH_SEPARATOR + 'c' });
    assert.notInclude(out, LINE_SEPARATOR);
    assert.notInclude(out, PARAGRAPH_SEPARATOR);
    assert.include(out, '\\u2028');
    assert.include(out, '\\u2029');
  });

  it('should not change what the value means', function () {
    const value = {
      name: '</script>',
      nested: { list: ['<a>', 'plain', LINE_SEPARATOR], n: 42, t: true, nil: null },
      unicode: 'héllo wörld 中文'
    };
    assert.deepStrictEqual(JSON.parse(jsonForScript(value)), value);
  });

  it('should handle the values the routes actually pass it', function () {
    assert.strictEqual(JSON.parse(jsonForScript('a-ticket-string')), 'a-ticket-string');
    assert.deepStrictEqual(JSON.parse(jsonForScript({})), {});
    assert.deepStrictEqual(JSON.parse(jsonForScript([])), []);
  });
});
