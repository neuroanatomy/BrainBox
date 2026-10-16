/* global AtlasMakerWidget */
'use strict';

/*
  Browser tests for the Adjust tool (view/atlasmaker/src/tools/adjust/index.js), loaded
  on demand when the user picks Adjust in the toolbar. It adds a panel over the image
  with three sliders - transparency of the annotation, brightness and contrast of the
  MRI - and removes the panel when the user picks another tool. Driven with the real
  mouse, as a user would.
*/

const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');

const ADJUST = '#paintTool [title="Adjust"]';
const SHOW = '#paintTool [title="Show"]';
// The thumb position is read back from style.left, which the browser keeps to ~6 significant digits
const TOLERANCE = 1e-4;
// A slider set back from the canvas filter, which the browser also keeps to ~6 significant digits
const FILTER_TOLERANCE = 1e-2;

/**
 * Drag a slider's thumb to a fraction of its track: press on the slider, move, release.
 * @param {Object} page A puppeteer page
 * @param {string} id The slider's id: alphaLevel, minLevel or maxLevel
 * @param {number} fraction Where to release, from 0 (left) to 1 (right)
 * @returns {Promise<number>} The slider's new value, as shown by its thumb (0-100)
 */
const dragSlider = async (page, id, fraction) => {
  const track = await page.$eval(`#${id} .track`, (el) => {
    const r = el.getBoundingClientRect();

    return { x: r.x, y: r.y, w: r.width };
  });
  await page.mouse.move(track.x + (track.w / 2), track.y);
  await page.mouse.down();
  await page.mouse.move(track.x + (track.w * fraction), track.y, { steps: 5 });
  await page.mouse.up();

  return page.$eval(`#${id} .thumb`, (el) => parseFloat(el.style.left));
};

/**
 * The brightness and contrast applied to the MRI canvas, if any.
 * @param {Object} page A puppeteer page
 * @returns {Promise<Object|null>} { brightness, contrast }, or null when no filter is set
 */
const canvasFilter = (page) => page.$eval('#canvas', (el) => {
  const m = el.style.filter.match(/brightness\(([\d.]+)\)\s*contrast\(([\d.]+)\)/);

  return m ? { brightness: parseFloat(m[1]), contrast: parseFloat(m[2]) } : null;
});

const thumbs = (page) => page.evaluate(() => ['alphaLevel', 'minLevel', 'maxLevel']
  .map((id) => parseFloat(document.querySelector(`#${id} .thumb`).style.left)));

const openAdjust = async (page) => {
  await page.click(ADJUST);
  await page.waitForSelector('#resizable > #adjust #maxLevel .thumb', { timeout: U.mediumTimeout });
};

describe('TESTING THE ADJUST TOOL', function () {
  let browser;
  let page;

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    browser = await puppeteer.launch({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  });

  beforeEach(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout * 2);
    page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900 });
    await U.blockExternalRequests(page);
    await page.goto(`${U.serverURL}/mri?url=${U.localBertURL}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.AtlasMakerWidget && AtlasMakerWidget.brainImg && AtlasMakerWidget.brainImg.img && document.querySelector('#paintTool [title="Adjust"]'),
      { timeout: U.longTimeout }
    );
  });

  afterEach(async function () {
    if (page) { await page.close(); }
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

  it('opens a panel over the image, with its sliders at their starting values', async function () {
    assert.isNull(await page.$('#adjust'), 'no panel before the tool is picked');
    await openAdjust(page);
    const alpha = await page.evaluate(() => AtlasMakerWidget.alphaLevel);
    assert.deepEqual(await thumbs(page), [alpha * 100, 50, 50], 'transparency at the current level, brightness and contrast centred');
    assert.isNull(await canvasFilter(page), 'opening the panel does not change the image');
  }).timeout(U.longTimeout);

  it('sets the annotation\'s transparency', async function () {
    await openAdjust(page);
    const x = await dragSlider(page, 'alphaLevel', 0.8);
    assert.closeTo(x, 80, 2);
    assert.closeTo(await page.evaluate(() => AtlasMakerWidget.alphaLevel), x / 100, TOLERANCE);
  }).timeout(U.longTimeout);

  it('sets brightness, then contrast, of the MRI, each keeping the other', async function () {
    await openAdjust(page);
    const b = await dragSlider(page, 'minLevel', 0.3);
    assert.closeTo(b, 30, 2);
    let filter = await canvasFilter(page);
    assert.closeTo(filter.brightness, 2 * b / 100, TOLERANCE);
    assert.closeTo(filter.contrast, 1, TOLERANCE, 'contrast stays at its centre value');

    const c = await dragSlider(page, 'maxLevel', 0.75);
    assert.closeTo(c, 75, 2);
    filter = await canvasFilter(page);
    assert.closeTo(filter.brightness, 2 * b / 100, TOLERANCE, 'brightness is kept');
    assert.closeTo(filter.contrast, 2 * c / 100, TOLERANCE);
  }).timeout(U.longTimeout);

  it('closes the panel when another tool is picked, keeping the image as adjusted', async function () {
    await openAdjust(page);
    await dragSlider(page, 'minLevel', 0.7);
    const adjusted = await canvasFilter(page);
    await page.click(SHOW);
    await page.waitForFunction(() => !document.getElementById('adjust'), { timeout: U.shortTimeout });
    assert.strictEqual(await page.evaluate(() => AtlasMakerWidget.User.tool), 'show');
    assert.deepEqual(await canvasFilter(page), adjusted);
  }).timeout(U.longTimeout);

  it('opens a fresh panel when picked again, and closes it again', async function () {
    await openAdjust(page);
    await page.click(SHOW);
    await page.waitForFunction(() => !document.getElementById('adjust'), { timeout: U.shortTimeout });
    await openAdjust(page);
    assert.strictEqual(await page.$$eval('#adjust', (els) => els.length), 1, 'one panel, not two');
    const x = await dragSlider(page, 'alphaLevel', 0.2);
    assert.closeTo(await page.evaluate(() => AtlasMakerWidget.alphaLevel), x / 100, TOLERANCE, 'the new panel\'s sliders work');
    await page.click(SHOW);
    await page.waitForFunction(() => !document.getElementById('adjust'), { timeout: U.shortTimeout });
  }).timeout(U.longTimeout);

  // from PR #342, 28356b4, Nicolas Traut
  it('shows the image\'s brightness and contrast when picked again, and keeps one when the other is moved', async function () {
    await openAdjust(page);
    const a = await dragSlider(page, 'alphaLevel', 0.2);
    const b = await dragSlider(page, 'minLevel', 0.3);
    const c = await dragSlider(page, 'maxLevel', 0.75);
    await page.click(SHOW);
    await page.waitForFunction(() => !document.getElementById('adjust'), { timeout: U.shortTimeout });

    await openAdjust(page);
    const [a2, b2, c2] = await thumbs(page);
    assert.closeTo(a2, a, TOLERANCE, 'transparency as set');
    assert.closeTo(b2, b, FILTER_TOLERANCE, 'brightness as set');
    assert.closeTo(c2, c, FILTER_TOLERANCE, 'contrast as set');

    const c3 = await dragSlider(page, 'maxLevel', 0.6);
    const filter = await canvasFilter(page);
    assert.closeTo(filter.brightness, 2 * b / 100, TOLERANCE, 'brightness is kept');
    assert.closeTo(filter.contrast, 2 * c3 / 100, TOLERANCE);
  }).timeout(U.longTimeout);
});
