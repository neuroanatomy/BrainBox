/* eslint-disable no-undefined -- how undefined values are merged is part of what is tested */
'use strict';

/*
  view/shared/deepExtend.js replaces jQuery's $.extend(true, ...) in atlasmaker.js.
  Each case runs both on identical inputs and requires identical results, including
  which values are shared with the sources and which are cloned.
*/

const { assert } = require('chai');
const { JSDOM } = require('jsdom');
const jQueryFactory = require('jquery');
const { deepExtend, isPlainObject } = require('../../view/shared/deepExtend');

const $ = jQueryFactory(new JSDOM('').window);

class Thing { constructor(v) { this.v = v; } }

// Each case builds fresh inputs, so jQuery and deepExtend never share objects
const cases = {
  'nested plain objects': () => [{ a: 1, b: { c: 2, d: { e: 3 } } }, { b: { d: { f: 4 }, g: 5 }, h: 6 }],
  'arrays are merged index by index, keeping extra target elements': () => [{ list: [1, 2, 3, 4] }, { list: ['a', 'b'] }],
  'arrays of objects are merged element-wise': () => [{ atlas: [{ name: 'A', labels: 'x.json' }, { name: 'B' }] }, { atlas: [{ filename: 'Atlas.nii.gz' }] }],
  'an array replaces a non-array': () => [{ k: { a: 1 } }, { k: [1, 2] }],
  'an object replaces a non-plain-object': () => [{ k: [1, 2], j: 'str', i: 3 }, { k: { a: 1 }, j: { b: 2 }, i: { c: 3 } }],
  'undefined is skipped, null and falsy values are copied': () => [{ a: 1, b: 2, c: 3, d: 4, e: 5 }, { a: undefined, b: null, c: 0, d: '', e: false }],
  'non-plain objects are copied by reference': () => [{ when: null, thing: { v: 0 } }, { when: new Date(0), thing: new Thing(1), re: /x/ }],
  'several sources, in order': () => [{ a: 1 }, { a: 2, b: { c: 1 } }, null, { b: { d: 2 } }, undefined, { a: 3 }],
  '__proto__ keys are ignored': () => [{}, JSON.parse('{"__proto__": {"polluted": true}, "ok": 1}')],
  'objects with no prototype count as plain': () => {
    const bare = Object.create(null);
    bare.x = { y: 1 };

    return [{ x: { z: 2 } }, bare];
  },
  // The call in atlasmaker.js: `info` (from the page, not yet downloaded) gets the fields
  // known once the server has the MRI, and keeps its own mri.annotations
  'MRI info merged after download, as in _configureMRI': () => [
    {
      source: 'http://example.org/brain.nii.gz',
      name: 'Brain',
      mri: {
        atlas: [{ name: 'Default', project: 'p1', labels: 'foreground.json' }],
        annotations: { p1: { note: { type: 'text', value: 'kept' } } }
      }
    },
    {
      source: 'http://example.org/brain.nii.gz',
      url: '/data/abc/',
      filename: 'brain.nii.gz',
      success: true,
      dim: [256, 256, 256],
      pixdim: [1, 1, 1],
      voxel2world: [[-1, 0, 0], [0, 0, -1], [0, 1, 0]],
      worldOrigin: [133.4, -110, 128],
      mri: { atlas: [{ name: 'Default', project: 'p1', filename: 'Atlas.nii.gz', labels: 'foreground.json', access: 'edit' }] }
    }
  ]
};

describe('deepExtend (replacement for $.extend(true, ...))', function () {
  // eslint-disable-next-line mocha/no-setup-in-describe -- one test per case, generated from the table above
  for (const [name, make] of Object.entries(cases)) {
    it(`behaves as jQuery: ${name}`, function () {
      const forJQuery = make();
      const forUs = make();
      const expected = $.extend(true, ...forJQuery);
      const actual = deepExtend(...forUs);

      assert.strictEqual(actual, forUs[0], 'returns the target itself');
      assert.deepEqual(actual, expected);
      assert.deepEqual(Object.keys(actual), Object.keys(expected), 'same keys, in the same order');
      assert.isFalse(Object.prototype.hasOwnProperty.call({}, 'polluted'), 'Object.prototype untouched');
    });
  }

  it('clones nested objects and arrays from the sources instead of moving them', function () {
    const source = { o: { a: 1 }, arr: [{ b: 2 }] };
    const target = deepExtend({}, source);
    assert.notStrictEqual(target.o, source.o);
    assert.notStrictEqual(target.arr, source.arr);
    assert.notStrictEqual(target.arr[0], source.arr[0]);
    source.o.a = 99;
    assert.strictEqual(target.o.a, 1);
  });

  it('keeps references to non-plain objects, as jQuery does', function () {
    const date = new Date(0);
    const thing = new Thing(1);
    const ours = deepExtend({}, { date, thing });
    const theirs = $.extend(true, {}, { date, thing });
    assert.strictEqual(ours.date, date);
    assert.strictEqual(ours.thing, thing);
    assert.strictEqual(theirs.date, date);
    assert.strictEqual(theirs.thing, thing);
  });

  it('skips a property that refers to the target itself', function () {
    const target = { a: 1 };
    const result = deepExtend(target, { self: target, b: 2 });
    assert.notProperty(result, 'self');
    assert.strictEqual(result.b, 2);
  });

  it('agrees with jQuery.isPlainObject', function () {
    // eslint-disable-next-line no-new-object -- `new Object()` is one of the cases
    const values = [{}, Object.create(null), new Object(), [], null, undefined, 1, 'a', new Date(), new Thing(1), /x/, () => null, new (new JSDOM('').window.Object)()];
    for (const v of values) {
      assert.strictEqual(isPlainObject(v), $.isPlainObject(v), `for ${Object.prototype.toString.call(v)}`);
    }
  });
});
