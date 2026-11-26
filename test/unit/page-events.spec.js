'use strict';

/*
  view/shared/pageEvents.js: the helpers that the MRI page and the project page both had
  (T002 C1, W5): isEmptyObject, delegate (mri-page.js's onDocument is delegate(document, …))
  and preventDoubleTapZoom, in a jsdom document.
*/

const { assert } = require('chai');
const { JSDOM } = require('jsdom');
const { isEmptyObject, delegate, preventDoubleTapZoom } = require('../../view/shared/pageEvents.js');

const newDocument = () => new JSDOM(`<!DOCTYPE html><html><body>
  <table id="files"><tbody><tr><td><span class="name">a</span></td></tr></tbody></table>
  <p id="outside" class="cell">b</p>
</body></html>`).window.document;

/**
 * A touchstart on `target` at `timeStamp`, with `fingers` touches (jsdom has no TouchEvent
 * constructor: the handler reads only timeStamp, touches and the targets)
 * @param {Document} document The document
 * @param {Element} target The touched element
 * @param {number} timeStamp The event's time
 * @param {number} [fingers] Number of touches
 * @returns {Event} The event, after dispatch
 */
const touch = (document, target, timeStamp, fingers = 1) => {
  const e = new document.defaultView.Event('touchstart', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'timeStamp', { value: timeStamp });
  Object.defineProperty(e, 'touches', { value: { length: fingers } });
  target.dispatchEvent(e);

  return e;
};

describe('The page helpers shared by the MRI and project pages (view/shared/pageEvents.js)', function () {
  describe('isEmptyObject', function () {
    it('is true for an object without enumerable properties, own or inherited', function () {
      assert.isTrue(isEmptyObject({}));
      assert.isTrue(isEmptyObject(Object.create(null)));
      assert.isTrue(isEmptyObject(null));
      assert.isTrue(isEmptyObject(Object.defineProperty({}, 'hidden', { value: 1, enumerable: false })));
    });

    it('is false as soon as there is one, own or inherited', function () {
      assert.isFalse(isEmptyObject({ a: 1 }));
      assert.isFalse(isEmptyObject(Object.create({ inherited: 1 })));
      assert.isFalse(isEmptyObject({ a: null }));
    });
  });

  describe('delegate', function () {
    it('calls the handler with the event and the matching element, for each listed type', function () {
      const document = newDocument();
      const calls = [];
      delegate(document, 'click focusout', '#files td', (e, matched) => calls.push([e.type, matched.tagName]));
      const span = document.querySelector('.name');
      span.dispatchEvent(new document.defaultView.Event('click', { bubbles: true }));
      span.dispatchEvent(new document.defaultView.Event('focusout', { bubbles: true }));
      span.dispatchEvent(new document.defaultView.Event('keydown', { bubbles: true }));
      assert.deepEqual(calls, [['click', 'TD'], ['focusout', 'TD']]);
    });

    it('ignores events outside the selector, and on the document itself', function () {
      const document = newDocument();
      let calls = 0;
      delegate(document, 'click', '#files td', () => { calls += 1; });
      document.getElementById('outside').dispatchEvent(new document.defaultView.Event('click', { bubbles: true }));
      document.dispatchEvent(new document.defaultView.Event('click', { bubbles: true }));
      assert.strictEqual(calls, 0);
    });

    it('on an element, only matches inside it, never the element itself', function () {
      const document = newDocument();
      const tbody = document.querySelector('#files tbody');
      const matched = [];
      // 'tbody, td' and '.cell': the root itself and an element outside it match the selector
      delegate(tbody, 'click', 'tbody, td, .cell', (e, el) => matched.push(el.tagName));
      tbody.dispatchEvent(new document.defaultView.Event('click', { bubbles: true }));
      document.querySelector('.name').dispatchEvent(new document.defaultView.Event('click', { bubbles: true }));
      assert.deepEqual(matched, ['TD']);
    });
  });

  describe('preventDoubleTapZoom', function () {
    it('cancels a second one-finger touch within 500 ms, and clicks the touched element twice', function () {
      const document = newDocument();
      const span = document.querySelector('.name');
      let clicks = 0;
      span.addEventListener('click', () => { clicks += 1; });
      preventDoubleTapZoom(document.body);
      assert.isFalse(touch(document, span, 1000).defaultPrevented, 'a first tap');
      assert.isTrue(touch(document, span, 1300).defaultPrevented, 'a double tap');
      assert.strictEqual(clicks, 2);
    });

    it('lets a slow second tap, and a two-finger touch, through', function () {
      const document = newDocument();
      const span = document.querySelector('.name');
      let clicks = 0;
      span.addEventListener('click', () => { clicks += 1; });
      preventDoubleTapZoom(document.body);
      touch(document, span, 1000);
      assert.isFalse(touch(document, span, 1600).defaultPrevented, '600 ms later');
      assert.isFalse(touch(document, span, 1700, 2).defaultPrevented, 'two fingers');
      assert.strictEqual(clicks, 0);
    });

    it('times each touched element on its own (the project page)', function () {
      const document = newDocument();
      preventDoubleTapZoom(document.body);
      touch(document, document.querySelector('.name'), 1000);
      assert.isFalse(touch(document, document.getElementById('outside'), 1100).defaultPrevented);
    });

    it('can time the taps on the body and click it (the MRI page), or click with another function', function () {
      const document = newDocument();
      const clicked = [];
      preventDoubleTapZoom(document.body, { tapped: (e) => e.currentTarget, click: (el) => clicked.push(el.tagName) });
      touch(document, document.querySelector('.name'), 1000);
      assert.isTrue(touch(document, document.getElementById('outside'), 1100).defaultPrevented);
      assert.deepEqual(clicked, ['BODY', 'BODY']);
    });
  });
});
