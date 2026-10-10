/* eslint-disable max-lines */
/* global AtlasMakerWidget */
'use strict';

/*
  Browser tests for the pointer side of view/atlasmaker/src/atlasmaker-interaction.js:
  how mouse and touch positions become image coordinates (canvas size and page offset,
  with the page scrolled), the square cursor that follows the pointer, a real paint stroke,
  and the "precise cursor" for touch screens (#finger: tap to switch between moving and
  drawing, drag to move, long press to configure). Touch events are real ones, sent
  through the DevTools protocol.
*/

const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');

const SCROLL = 60;

const openViewer = async (browser) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900, hasTouch: true });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await U.blockExternalRequests(page);
  await page.goto(`${U.serverURL}/mri?url=${U.localBertURL}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.AtlasMakerWidget && AtlasMakerWidget.brainImg && AtlasMakerWidget.brainImg.img &&
      AtlasMakerWidget.flagConnected === 1 && AtlasMakerWidget.atlas && AtlasMakerWidget.isViewerReady(),
    { timeout: U.longTimeout }
  );
  // Scroll, so that page and viewport coordinates differ; keep the canvas in view
  await page.evaluate((y) => {
    document.getElementById('canvas').scrollIntoView({ block: 'start' });
    window.scrollBy(0, -y);
  }, SCROLL);
  // Record the generic pointer handlers' arguments, still calling them
  await page.evaluate(() => {
    window.__calls = [];
    for (const name of ['down', 'move', 'up']) {
      const original = AtlasMakerWidget[name];
      AtlasMakerWidget[name] = function (x, y) {
        window.__calls.push([name, x, y]);

        return original.call(this, x, y);
      };
    }
  });
  const cdp = await page.target().createCDPSession();

  return { page, cdp, pageErrors };
};

/**
 * Where a viewport point falls in the image, computed independently of the viewer's code
 * from the canvas's box and pixel size, and where the square cursor should then be
 * @param {Object} page The puppeteer page
 * @param {number} clientX Viewport x
 * @param {number} clientY Viewport y
 * @returns {Promise<Object>} { x, y (as passed to down/move/up), cursor: {left, top, width, height} }
 */
const expectedAt = (page, clientX, clientY) => page.evaluate((cx, cy) => {
  const me = AtlasMakerWidget;
  const canvas = document.querySelector('#atlasmaker canvas');
  const rect = canvas.getBoundingClientRect();
  const W = parseFloat(getComputedStyle(canvas).width);
  const H = parseFloat(getComputedStyle(canvas).height);
  const w = parseFloat(canvas.getAttribute('width'));
  const h = parseFloat(canvas.getAttribute('height'));
  const x = parseInt((cx - rect.left) * (w / W), 10);
  const y = parseInt((cy - rect.top) * (h / H), 10);

  return {
    x,
    y: Math.round(y * me.brainWdim / me.brainHdim),
    cursor: { left: x / (w / W), top: y / (h / H), width: me.User.penSize / (w / W), height: me.User.penSize / (h / H) }
  };
}, clientX, clientY);

const cursorBox = (page) => page.$eval('#cursor', (el) => ({
  left: parseFloat(el.style.left), top: parseFloat(el.style.top), width: parseFloat(el.style.width), height: parseFloat(el.style.height)
}));

const canvasPoint = (page, fx, fy) => page.$eval('#canvas', (el, a, b) => {
  const r = el.getBoundingClientRect();

  return { x: r.left + (r.width * a), y: r.top + (r.height * b) };
}, fx, fy);

const touch = (cdp, type, point) => cdp.send('Input.dispatchTouchEvent', {
  type,
  touchPoints: point ? [{ x: point.x, y: point.y }] : []
});

const takeCalls = (page) => page.evaluate(() => window.__calls.splice(0));

const assertCursorAt = (actual, expected) => {
  for (const k of ['left', 'top', 'width', 'height']) {
    assert.closeTo(actual[k], expected[k], 1e-3, `cursor ${k}`);
  }
};

// eslint-disable-next-line max-statements
describe('TESTING MOUSE AND TOUCH ON THE VIEWER', function () {
  let browser;
  let viewer;

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    browser = await puppeteer.launch({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  });

  beforeEach(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout * 2);
    viewer = await openViewer(browser);
  });

  afterEach(async function () {
    if (viewer && viewer.page) { await viewer.page.close(); }
    viewer = null;
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

  it('places the square cursor at the image centre, sized to the pen', async function () {
    const { page } = viewer;
    const result = await page.evaluate(() => {
      const me = AtlasMakerWidget;
      me.initCursor();
      const canvas = document.querySelector('#atlasmaker canvas');
      const W = parseFloat(getComputedStyle(canvas).width);
      const H = parseFloat(getComputedStyle(canvas).height);
      const w = parseFloat(canvas.getAttribute('width'));
      const h = parseFloat(canvas.getAttribute('height'));

      return {
        crsr: [me.Crsr.x, me.Crsr.y, me.Crsr.fx, me.Crsr.fy],
        expected: [parseInt(w / 2, 10), parseInt(h / 2, 10), parseInt(w / 2, 10) * (W / w), parseInt(h / 2, 10) * (H / h)],
        cursorExpected: { left: parseInt(w / 2, 10) * (W / w), top: parseInt(h / 2, 10) * (H / h), width: me.User.penSize * (W / w), height: me.User.penSize * (H / h) }
      };
    });
    assert.deepEqual(result.crsr, result.expected);
    assertCursorAt(await cursorBox(page), result.cursorExpected);
  }).timeout(U.longTimeout);

  // eslint-disable-next-line max-statements
  it('maps mouse positions to image coordinates, and moves the cursor with the mouse', async function () {
    const { page } = viewer;
    const points = [[0.3, 0.6], [0.71, 0.22], [0.05, 0.95]];
    for (const [fx, fy] of points) {
      // eslint-disable-next-line no-await-in-loop
      const p = await canvasPoint(page, fx, fy);
      // eslint-disable-next-line no-await-in-loop
      await page.mouse.move(p.x, p.y);
      // eslint-disable-next-line no-await-in-loop
      const expected = await expectedAt(page, p.x, p.y);
      // eslint-disable-next-line no-await-in-loop
      const calls = await takeCalls(page);
      assert.deepEqual(calls[calls.length - 1], ['move', expected.x, expected.y], `move at (${fx}, ${fy})`);
      // eslint-disable-next-line no-await-in-loop
      assertCursorAt(await cursorBox(page), expected.cursor);
    }
    const p = await canvasPoint(page, 0.4, 0.45);
    const expected = await expectedAt(page, p.x, p.y);
    await page.mouse.move(p.x, p.y);
    await takeCalls(page);
    await page.mouse.down();
    await page.mouse.up();
    assert.deepEqual(await takeCalls(page), [['down', expected.x, expected.y], ['up', expected.x, expected.y]]);
  }).timeout(U.longTimeout);

  it('paints voxels along a mouse stroke with the Paint tool', async function () {
    const { page } = viewer;
    await page.evaluate(() => document.querySelector('#paintTool [title="Paint"]').click());
    const painted = () => page.evaluate(() => AtlasMakerWidget.atlas.data.reduce((n, v) => n + (v ? 1 : 0), 0));
    const before = await painted();
    const a = await canvasPoint(page, 0.4, 0.4);
    const b = await canvasPoint(page, 0.6, 0.5);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
    assert.isAbove(await painted(), before, 'the stroke painted voxels');
    assert.deepEqual(viewer.pageErrors, []);
  }).timeout(U.longTimeout);

  // eslint-disable-next-line max-statements
  it('maps touches to image coordinates, and moves the cursor with the finger', async function () {
    const { page, cdp } = viewer;
    const a = await canvasPoint(page, 0.35, 0.4);
    const b = await canvasPoint(page, 0.55, 0.65);
    const expectedA = await expectedAt(page, a.x, a.y);
    const expectedB = await expectedAt(page, b.x, b.y);
    await takeCalls(page);
    await touch(cdp, 'touchStart', a);
    await touch(cdp, 'touchMove', b);
    assertCursorAt(await cursorBox(page), expectedB.cursor);
    await touch(cdp, 'touchEnd');
    const calls = await takeCalls(page);
    assert.deepEqual(calls[0], ['down', expectedA.x, expectedA.y]);
    assert.deepEqual(calls.find((c) => c[0] === 'move'), ['move', expectedB.x, expectedB.y]);
    // touchend passes the raw image y, unlike touchstart/touchmove
    const raw = await page.evaluate((cy) => {
      const canvas = document.querySelector('#atlasmaker canvas');
      const r = canvas.getBoundingClientRect();

      return parseInt((cy - r.top) * (parseFloat(canvas.getAttribute('height')) / parseFloat(getComputedStyle(canvas).height)), 10);
    }, b.y);
    assert.deepEqual(calls[calls.length - 1], ['up', expectedB.x, raw]);
    assert.deepEqual(viewer.pageErrors, []);
  }).timeout(U.longTimeout);

  describe('the precise cursor', function () {
    const finger = (page) => page.evaluate(() => {
      const el = document.getElementById('finger');
      if (!el) { return null; }
      const r = el.getBoundingClientRect();

      return {
        inContainer: el.parentNode === AtlasMakerWidget.container,
        className: el.className,
        left: el.style.left,
        top: el.style.top,
        center: { x: r.left + (r.width / 2), y: r.top + (r.height / 2) },
        state: AtlasMakerWidget.Crsr.state
      };
    });

    it('appears at the image centre, and takes over the canvas\'s touch handling', async function () {
      const { page } = viewer;
      await page.evaluate(() => AtlasMakerWidget.togglePreciseCursor());
      const f = await finger(page);
      const crsr = await page.evaluate(() => ({ fx: AtlasMakerWidget.Crsr.fx, fy: AtlasMakerWidget.Crsr.fy, canvasTouch: AtlasMakerWidget.canvas.ontouchstart }));
      assert.include(f, { inContainer: true, className: 'touchDevice move', state: 'move' });
      assert.strictEqual(f.left, `${crsr.fx}px`);
      assert.strictEqual(f.top, `${crsr.fy}px`);
      assert.isNull(crsr.canvasTouch);

      await page.evaluate(() => AtlasMakerWidget.togglePreciseCursor());
      assert.isNull(await finger(page), 'switching it off removes it');
      assert.isTrue(await page.evaluate(() => AtlasMakerWidget.canvas.ontouchstart === AtlasMakerWidget.touchstart), 'and gives touch back to the canvas');
    }).timeout(U.longTimeout);

    it('switches between moving and drawing on a short tap', async function () {
      const { page, cdp } = viewer;
      await page.evaluate(() => AtlasMakerWidget.togglePreciseCursor());
      const f = await finger(page);
      await touch(cdp, 'touchStart', f.center);
      await touch(cdp, 'touchEnd');
      await page.waitForFunction(() => AtlasMakerWidget.Crsr.state === 'draw', { timeout: U.shortTimeout });
      assert.strictEqual((await finger(page)).className, 'touchDevice draw');
      await touch(cdp, 'touchStart', f.center);
      await touch(cdp, 'touchEnd');
      await page.waitForFunction(() => AtlasMakerWidget.Crsr.state === 'move', { timeout: U.shortTimeout });
      assert.strictEqual((await finger(page)).className, 'touchDevice move');
    }).timeout(U.longTimeout);

    // eslint-disable-next-line max-statements
    it('follows a drag, moving the finger and the square cursor by the same amount', async function () {
      const { page, cdp } = viewer;
      await page.evaluate(() => AtlasMakerWidget.togglePreciseCursor());
      const start = await finger(page);
      const before = await page.evaluate(() => ({ x: AtlasMakerWidget.Crsr.x, y: AtlasMakerWidget.Crsr.y }));
      const cursorBefore = await cursorBox(page);
      const to = { x: start.center.x + 60, y: start.center.y + 40 };
      await touch(cdp, 'touchStart', start.center);
      await touch(cdp, 'touchMove', { x: start.center.x + 30, y: start.center.y + 20 });
      await touch(cdp, 'touchMove', to);
      await touch(cdp, 'touchEnd');
      const end = await finger(page);
      const after = await page.evaluate(() => {
        const canvas = document.querySelector('#atlasmaker canvas');

        return {
          x: AtlasMakerWidget.Crsr.x,
          y: AtlasMakerWidget.Crsr.y,
          scale: parseFloat(getComputedStyle(canvas).width) / parseFloat(canvas.getAttribute('width'))
        };
      });
      const cursorAfter = await cursorBox(page);
      // The finger moves on screen by the drag, to within an image pixel
      assert.closeTo(end.center.x - start.center.x, 60, after.scale + 1);
      assert.closeTo(end.center.y - start.center.y, 40, after.scale + 1);
      // The cursor moves by the same number of image pixels as Crsr
      assert.isAbove(after.x, before.x);
      assert.isAbove(after.y, before.y);
      assert.closeTo(cursorAfter.left - cursorBefore.left, (after.x - before.x) * after.scale, 1e-3);
      assert.closeTo(cursorAfter.top - cursorBefore.top, (after.y - before.y) * after.scale, 1e-3);
      assert.deepEqual(viewer.pageErrors, []);
    }).timeout(U.longTimeout);

    it('goes into configure mode on a long press, and back when released', async function () {
      const { page, cdp } = viewer;
      await page.evaluate(() => AtlasMakerWidget.togglePreciseCursor());
      const f = await finger(page);
      await touch(cdp, 'touchStart', f.center);
      await page.waitForFunction(() => AtlasMakerWidget.Crsr.state === 'configure', { timeout: U.shortTimeout });
      assert.strictEqual((await finger(page)).className, 'touchDevice configure');
      await touch(cdp, 'touchEnd');
      await page.waitForFunction(() => AtlasMakerWidget.Crsr.state === 'move', { timeout: U.shortTimeout });
      assert.strictEqual((await finger(page)).className, 'touchDevice move');
    }).timeout(U.longTimeout);
  });

  it('draws a measurement scaled to the displayed image', async function () {
    const { page } = viewer;
    const result = await page.evaluate(() => {
      const me = AtlasMakerWidget;
      me.User.measureLength = [{ x: 10, y: 20 }, { x: 40, y: 60 }];
      const svg = me.measureToolDisplayInformation('');
      me.User.measureLength = null;
      const canvas = document.querySelector('#atlasmaker canvas');
      const zx = parseFloat(getComputedStyle(canvas).width) / parseFloat(canvas.getAttribute('width'));
      const zy = zx * me.brainHdim / me.brainWdim;

      return { svg, zx, zy };
    });
    const { zx, zy } = result;
    assert.include(result.svg, `<circle fill='#00ff00' cx=${zx * 10} cy=${zy * 20} r=3 />`);
    assert.include(result.svg, `d='M${zx * 10}, ${zy * 20}L${zx * 40}, ${zy * 60}'`);
  }).timeout(U.longTimeout);
});
