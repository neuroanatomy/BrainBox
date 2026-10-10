/* eslint-disable max-lines */
/* global $ */
'use strict';

/*
  view/shared/geometry.js replaces jQuery's .css('width'), .offset(), .offset({...}) and
  .css({...}) in atlasmaker-interaction.js. These need a layout engine, so they are compared
  with jQuery itself in a real browser: the MRI page, with jQuery 3.7.1 (a dev dependency,
  no longer used by BrainBox itself) loaded into it.
  Each case runs jQuery and geometry.js on the same element - restoring its style in between -
  and requires the same result.
*/

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');

const GEOMETRY_SOURCE = fs.readFileSync(path.join(__dirname, '../../view/shared/geometry.js'), 'utf8');

// Elements laid out for the comparisons, added to the MRI page
const FIXTURE = `
<div id="geo" style="position:relative;margin:13px;padding:7px;border:3px solid red;width:500px">
  <div id="plain" style="width:123.4px;height:56.7px">plain</div>
  <div id="padded" style="width:100px;height:50px;padding:5px 11px;border:2px solid blue">padded</div>
  <div id="borderbox" style="box-sizing:border-box;width:100px;height:50px;padding:5px 11px;border:2px solid blue">bb</div>
  <div id="percent" style="width:33.33%;height:10px">percent</div>
  <span id="inline">an inline span</span>
  <div id="hiddenParent" style="display:none"><div id="inHidden" style="padding:4px">in hidden</div></div>
  <div id="ownNone" style="display:none;width:80px;padding:3px">own none</div>
  <div id="absSet" style="position:absolute;left:31px;top:47px;width:40px;height:40px;margin:2px">abs</div>
  <div id="absAuto" style="position:absolute;width:40px;height:40px;margin:5px 9px">auto</div>
  <div id="static" style="width:40px;height:20px">static</div>
  <div id="fixed" style="position:fixed;left:15px;top:25px;width:30px;height:30px">fixed</div>
  <div id="transformed" style="transform:translate(17px, 9px) scale(1.5);width:20px;height:20px">t</div>
</div>
<div style="height:2000px"></div>`;

/**
 * Run a measurement with jQuery and with geometry.js on the same element, restoring its
 * style attribute in between, and return both results.
 * @param {Object} page The puppeteer page
 * @param {string} id The element's id
 * @param {string} kind 'width', 'height', 'contentWidth', 'contentHeight', 'offset', 'setOffset' or 'setStyle'
 * @param {*} arg The argument for setters
 * @returns {Promise<Object>} { jquery, ours }
 */
const compare = (page, id, kind, arg) => page.evaluate((elemId, what, argument) => {
  const el = document.getElementById(elemId);
  const G = window.__geometry;
  const saved = el.getAttribute('style');
  const outcome = () => ({ style: el.getAttribute('style'), offset: $(el).offset() });
  const run = {
    width: [() => $(el).css('width'), () => G.cssDimension(el, 'width')],
    contentWidth: [() => $(el).width(), () => G.contentSize(el, 'width')],
    contentHeight: [() => $(el).height(), () => G.contentSize(el, 'height')],
    height: [() => $(el).css('height'), () => G.cssDimension(el, 'height')],
    offset: [() => $(el).offset(), () => G.offset(el)],
    setOffset: [
      () => {
        $(el).offset(argument);

        return outcome();
      }, () => {
        G.setOffset(el, argument);

        return outcome();
      }
    ],
    setStyle: [
      () => {
        $(el).css(argument);

        return el.getAttribute('style');
      }, () => {
        G.setStyle(el, argument);

        return el.getAttribute('style');
      }
    ]
  }[what];
  const jquery = run[0]();
  el.setAttribute('style', saved);
  const ours = run[1]();
  el.setAttribute('style', saved);

  return { jquery, ours };
}, id, kind, arg);

describe('TESTING geometry.js AGAINST jQuery, IN A BROWSER', function () {
  let browser;
  let page;

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout * 2);
    browser = await puppeteer.launch({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900 });
    await U.blockExternalRequests(page);
    await page.goto(`${U.serverURL}/mri?url=${U.localBertURL}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.AtlasMakerWidget && window.AtlasMakerWidget.brainImg && window.AtlasMakerWidget.brainImg.img, { timeout: U.longTimeout });
    // The page no longer has jQuery: bring in the one to compare with
    await page.addScriptTag({ path: require.resolve('jquery/dist/jquery.js') });
    await page.addScriptTag({ content: `(function(){ var module = { exports: {} };\n${GEOMETRY_SOURCE}\nwindow.__geometry = module.exports; })();` });
    await page.evaluate((html) => document.body.insertAdjacentHTML('afterbegin', html), FIXTURE);
  });

  after(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    if (browser) { await browser.close(); }
    const res = await chai.request(U.serverURL).get('/mri/json')
      .query({ url: U.localBertURL });
    if (res.body && res.body.url) {
      await U.removeMRI({ dirPath: './public' + res.body.url, srcURL: U.localBertURL });
    }
  });

  it('compares with jQuery 3.7.1, the version BrainBox used', async function () {
    assert.strictEqual(await page.evaluate(() => $.fn.jquery), '3.7.1');
  });

  it('measures width and height as $(el).css() does', async function () {
    const ids = ['plain', 'padded', 'borderbox', 'percent', 'inline', 'inHidden', 'ownNone', 'absSet', 'fixed', 'transformed', 'canvas'];
    for (const id of ids) {
      for (const dim of ['width', 'height']) {
        // eslint-disable-next-line no-await-in-loop
        const { jquery, ours } = await compare(page, id, dim);
        assert.strictEqual(ours, jquery, `${dim} of #${id}`);
      }
    }
  }).timeout(U.mediumTimeout);

  it('measures content width and height as $(el).width() / .height() do', async function () {
    const ids = ['plain', 'padded', 'borderbox', 'percent', 'inline', 'inHidden', 'ownNone', 'absSet', 'fixed', 'transformed', 'canvas', 'geo'];
    for (const id of ids) {
      for (const dim of ['contentWidth', 'contentHeight']) {
        // eslint-disable-next-line no-await-in-loop
        const { jquery, ours } = await compare(page, id, dim);
        assert.strictEqual(ours, jquery, `${dim} of #${id}`);
      }
    }
  }).timeout(U.mediumTimeout);

  it('finds offsets as $(el).offset() does, scrolled or not', async function () {
    const ids = ['plain', 'padded', 'inline', 'inHidden', 'ownNone', 'absSet', 'absAuto', 'fixed', 'transformed', 'canvas'];
    for (const scroll of [0, 137]) {
      // eslint-disable-next-line no-await-in-loop
      await page.evaluate((y) => window.scrollTo(0, y), scroll);
      for (const id of ids) {
        // eslint-disable-next-line no-await-in-loop
        const { jquery, ours } = await compare(page, id, 'offset');
        assert.deepEqual(ours, jquery, `offset of #${id}, scrolled by ${scroll}`);
      }
    }
    assert.isUndefined(await page.evaluate(() => window.__geometry.offset(null)), 'like an empty selection');
  }).timeout(U.mediumTimeout);

  it('moves elements as $(el).offset({left, top}) does', async function () {
    const targets = [{ left: 250, top: 400 }, { left: 10.5, top: 3.25 }, { left: 300 }, { top: 50 }];
    for (const scroll of [0, 137]) {
      // eslint-disable-next-line no-await-in-loop
      await page.evaluate((y) => window.scrollTo(0, y), scroll);
      for (const id of ['absSet', 'absAuto', 'static', 'fixed', 'plain']) {
        for (const target of targets) {
          // eslint-disable-next-line no-await-in-loop
          const { jquery, ours } = await compare(page, id, 'setOffset', target);
          assert.deepEqual(ours, jquery, `#${id} to ${JSON.stringify(target)}, scrolled by ${scroll}`);
        }
      }
    }
  }).timeout(U.mediumTimeout);

  it('sets styles as $(el).css(props) does: numbers in px, NaN and null skipped', async function () {
    const cases = [
      { left: 12, top: '7px', width: 3.5, height: 0 },
      { left: '', top: '', width: '', height: '' },
      { left: 'NaNpx', width: 'Infinitypx' },
      // eslint-disable-next-line no-undefined -- undefined values are part of what is compared
      { left: null, top: undefined, width: 9 },
      { backgroundColor: 'rgb(1, 2, 3)' }
    ];
    for (const props of cases) {
      // eslint-disable-next-line no-await-in-loop
      const { jquery, ours } = await compare(page, 'absSet', 'setStyle', props);
      assert.strictEqual(ours, jquery, JSON.stringify(props));
    }
    // NaN does not survive JSON: run it in the page
    const nan = await page.evaluate(() => {
      const el = document.getElementById('absSet');
      const saved = el.getAttribute('style');
      $(el).css({ left: NaN, width: 5 });
      const jquery = el.getAttribute('style');
      el.setAttribute('style', saved);
      window.__geometry.setStyle(el, { left: NaN, width: 5 });
      const ours = el.getAttribute('style');
      el.setAttribute('style', saved);

      return { jquery, ours };
    });
    assert.strictEqual(nan.ours, nan.jquery);
  }).timeout(U.mediumTimeout);
});
