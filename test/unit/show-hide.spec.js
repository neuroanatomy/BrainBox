'use strict';

/*
  view/shared/showHide.js replaces jQuery's .show() / .hide() in atlasmaker-interaction.js.
  Each case builds the same element twice in a jsdom document, runs the same sequence of
  show/hide calls with jQuery on one and with showHide.js on the other, and requires the
  same inline display after every step.
*/

const { assert } = require('chai');
const { JSDOM } = require('jsdom');
const jQueryFactory = require('jquery');
const { show, hide } = require('../../view/shared/showHide');

const dom = new JSDOM(`<!DOCTYPE html><html><head><style>
  .hidden-by-css { display: none; }
  .flex-by-css { display: flex; }
</style></head><body></body></html>`);
const { document } = dom.window;
const $ = jQueryFactory(dom.window);

const ours = { show, hide };

// The elements of the toolbar this replaces, and the awkward cases around them
const elements = {
  'a div with inline display:flex (#tools-maximized, #textInputBlock)': '<div style="display:flex;flex-direction:column"></div>',
  'a div with no inline display (#tools-minimized)': '<div></div>',
  'a div hidden inline from the start': '<div style="display:none"></div>',
  'a div hidden by a stylesheet': '<div class="hidden-by-css"></div>',
  'a div hidden both inline and by a stylesheet': '<div class="hidden-by-css" style="display:none"></div>',
  'a div made flex by a stylesheet': '<div class="flex-by-css"></div>',
  'a span': '<span></span>',
  'an input (the upload file chooser)': '<input type="file">'
};
const sequences = [
  ['hide'],
  ['show'],
  ['hide', 'show'],
  ['show', 'hide', 'show'],
  ['hide', 'hide', 'show'],
  ['show', 'show'],
  ['hide', 'show', 'hide', 'show']
];

const make = (html) => {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const elem = holder.firstElementChild;
  document.body.appendChild(elem);

  return elem;
};

describe('showHide (replacement for jQuery\'s .show() / .hide())', function () {
  afterEach(function () {
    document.body.innerHTML = '';
  });

  // eslint-disable-next-line mocha/no-setup-in-describe -- one test per element, generated from the table above
  for (const [name, html] of Object.entries(elements)) {
    it(`behaves as jQuery for ${name}`, function () {
      for (const sequence of sequences) {
        const theirs = make(html);
        const mine = make(html);
        for (const step of sequence) {
          $(theirs)[step]();
          ours[step](mine);
          assert.strictEqual(mine.style.display, theirs.style.display, `after ${sequence.join(', ')} (step ${step})`);
        }
      }
    });
  }

  it('does nothing with null, as jQuery does with an empty selection', function () {
    assert.doesNotThrow(() => { show(null); hide(null); });
  });

  it('works on an element that is not in the document yet', function () {
    const theirs = document.createElement('div');
    const mine = document.createElement('div');
    $(theirs).hide();
    hide(mine);
    assert.strictEqual(mine.style.display, theirs.style.display);
    $(theirs).show();
    show(mine);
    assert.strictEqual(mine.style.display, theirs.style.display);
  });
});
