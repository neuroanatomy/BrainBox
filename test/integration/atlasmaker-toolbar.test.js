/* eslint-disable max-lines */
/* global AtlasMakerWidget */
'use strict';

/*
  Browser tests for the toolbar and page-state side of view/atlasmaker/src/atlasmaker-interaction.js:
  loading the command tools, the toolbar's position and minimised state, the pen colour
  button, the chat panel, CSS fullscreen (overlay, moving the viewer to <body> and back),
  the keyboard (Enter in an editable cell, Enter to report a measured length), and
  uploading a volume into the annotation.
*/

const path = require('path');
const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');

const BERT_FILE = path.join(__dirname, '../../public/test_data/bert_brain.nii.gz');

const openViewer = async (browser) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900 });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await U.blockExternalRequests(page);
  await page.goto(`${U.serverURL}/mri?url=${U.localBertURL}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.AtlasMakerWidget && AtlasMakerWidget.brainImg && AtlasMakerWidget.brainImg.img &&
      AtlasMakerWidget.flagConnected === 1 && AtlasMakerWidget.ontology && AtlasMakerWidget.atlas,
    { timeout: U.longTimeout }
  );

  return { page, pageErrors };
};

const assertArrowKeyChangesSlice = async (page) => {
  const slice = await page.evaluate(() => AtlasMakerWidget.User.slice);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction((s) => AtlasMakerWidget.User.slice === s + 1, { timeout: U.shortTimeout }, slice);
};

const inlineDisplay = (page, id) => page.$eval(`#${id}`, (el) => el.style.display);
const computedDisplay = (page, id) => page.$eval(`#${id}`, (el) => getComputedStyle(el).display);

// eslint-disable-next-line max-statements
describe('TESTING THE VIEWER\'S TOOLBAR AND PAGE STATE', function () {
  let browser;
  let viewer;

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    browser = await puppeteer.launch({ headless: true, ignoreHTTPSErrors: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
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

  it('loads every command tool listed in tools.json, and no other', async function () {
    const res = await chai.request(U.serverURL).get('/lib/atlasmaker-tools/tools.json');
    const commands = res.body.filter((t) => t.type === 'cmd').map((t) => `/lib/atlasmaker-tools/${t.name}.js`);
    assert.isAbove(commands.length, 0);
    const { page } = viewer;
    await page.waitForFunction((n) => [...document.scripts].filter((s) => s.src.includes('/lib/atlasmaker-tools/')).length >= n, { timeout: U.shortTimeout }, commands.length);
    const loaded = await page.evaluate(() => [...document.scripts].map((s) => new URL(s.src || 'about:blank').pathname)
      .filter((p) => p.startsWith('/lib/atlasmaker-tools/')));
    assert.sameMembers(loaded, commands);
  }).timeout(U.longTimeout);

  it('minimises and restores the toolbar, giving back its flex layout', async function () {
    const { page } = viewer;
    assert.strictEqual(await inlineDisplay(page, 'tools-maximized'), 'flex');
    await page.evaluate(() => AtlasMakerWidget.changeToolbarDisplay('minimize'));
    assert.strictEqual(await inlineDisplay(page, 'tools-maximized'), 'none');
    assert.strictEqual(await computedDisplay(page, 'tools-minimized'), 'block');
    await page.evaluate(() => AtlasMakerWidget.changeToolbarDisplay('maximize'));
    assert.strictEqual(await inlineDisplay(page, 'tools-maximized'), 'flex', 'the inline flex it had');
    assert.strictEqual(await computedDisplay(page, 'tools-minimized'), 'none');
  }).timeout(U.longTimeout);

  it('minimises and restores the toolbar through its buttons', async function () {
    const { page } = viewer;
    // Outside fullscreen these buttons have no size, so they are clicked from the page rather than with the mouse
    await page.evaluate(() => document.getElementById('display-minimize').click());
    assert.strictEqual(await inlineDisplay(page, 'tools-maximized'), 'none');
    await page.evaluate(() => document.getElementById('tools-minimized').click());
    assert.strictEqual(await inlineDisplay(page, 'tools-maximized'), 'flex');
  }).timeout(U.longTimeout);

  it('docks the toolbar left or right, clearing any position it was dragged to', async function () {
    const { page } = viewer;
    for (const side of ['left', 'right']) {
      // eslint-disable-next-line no-await-in-loop
      const state = await page.evaluate((where) => {
        const panel = document.getElementById('tools-side');
        Object.assign(panel.style, { left: '10px', top: '20px', right: '30px', height: '400px' });
        document.getElementById('tools-maximized').style.height = '300px';
        AtlasMakerWidget.changeToolbarDisplay(where);

        return {
          attr: document.body.getAttribute('data-toolbarDisplay'),
          side: [panel.style.left, panel.style.top, panel.style.right, panel.style.height],
          maximizedHeight: document.getElementById('tools-maximized').style.height
        };
      }, side);
      assert.deepEqual(state, { attr: side, side: ['', '', '', ''], maximizedHeight: '' });
    }
  }).timeout(U.longTimeout);

  it('paints the colour button with the chosen label\'s colour', async function () {
    const { page } = viewer;
    const result = await page.evaluate(() => {
      const index = AtlasMakerWidget.ontology.labels.length > 1 ? 1 : 0;
      AtlasMakerWidget.changePenColor(index);

      return {
        color: AtlasMakerWidget.ontology.labels[index].color,
        value: AtlasMakerWidget.ontology.labels[index].value,
        penValue: AtlasMakerWidget.User.penValue,
        background: getComputedStyle(document.getElementById('color')).backgroundColor
      };
    });
    assert.strictEqual(result.background, `rgb(${result.color[0]}, ${result.color[1]}, ${result.color[2]})`);
    assert.strictEqual(result.penValue, result.value);
  }).timeout(U.longTimeout);

  it('shows the chat panel, focused on its input, and hides it again', async function () {
    const { page } = viewer;
    const state = () => page.evaluate(() => ({
      block: document.getElementById('textInputBlock').style.display,
      chatHidden: document.getElementById('logChat').classList.contains('hidden'),
      scriptHidden: document.getElementById('logScript').classList.contains('hidden'),
      focused: document.activeElement && document.activeElement.id
    }));
    await page.evaluate(() => AtlasMakerWidget.toggleTextInput('none'));
    assert.strictEqual((await state()).block, 'none');
    await page.evaluate(() => AtlasMakerWidget.toggleTextInput('Chat'));
    assert.deepEqual(await state(), { block: 'flex', chatHidden: false, scriptHidden: true, focused: 'msg' });
    await page.evaluate(() => AtlasMakerWidget.toggleTextInput('none'));
    assert.strictEqual((await state()).block, 'none');
  }).timeout(U.longTimeout);

  it('enters CSS fullscreen over a dark overlay, and leaves it back where it was', async function () {
    const { page } = viewer;
    const snapshot = () => page.evaluate(() => {
      const overlay = document.getElementById('blackOverlay');
      const atlasmaker = document.getElementById('atlasmaker');

      return {
        fullscreen: AtlasMakerWidget.fullscreen,
        bodyClass: document.body.classList.contains('atlasmaker-fullscreen'),
        toolbarDisplay: document.body.getAttribute('data-toolbarDisplay'),
        parent: atlasmaker.parentNode.id || atlasmaker.parentNode.tagName,
        sameContainer: atlasmaker === AtlasMakerWidget.container,
        overlays: document.querySelectorAll('#blackOverlay').length,
        overlay: overlay
          ? {
            inBody: overlay.parentNode === document.body,
            position: overlay.style.position,
            inset: [overlay.style.top, overlay.style.left, overlay.style.width, overlay.style.height],
            zIndex: overlay.style.zIndex,
            background: overlay.style.backgroundColor
          }
          : null
      };
    });
    const before = await snapshot();
    assert.include(before, { fullscreen: false, bodyClass: false, parent: 'stereotaxic', overlays: 0 });

    await page.evaluate(() => AtlasMakerWidget.toggleFullscreen());
    const inside = await snapshot();
    assert.include(inside, { fullscreen: true, bodyClass: true, parent: 'BODY', sameContainer: true, overlays: 1 });
    assert.deepEqual(inside.overlay, {
      inBody: true, position: 'fixed', inset: ['0px', '0px', '100%', '100%'], zIndex: '5', background: 'rgb(34, 34, 34)'
    });

    await page.evaluate(() => AtlasMakerWidget.toggleFullscreen());
    const after = await snapshot();
    assert.include(after, { fullscreen: false, bodyClass: false, toolbarDisplay: 'right', parent: 'stereotaxic', sameContainer: true, overlays: 0 });

    // The viewer still responds after being moved around
    await assertArrowKeyChangesSlice(page);
    assert.deepEqual(viewer.pageErrors, []);
  }).timeout(U.longTimeout);

  it('keeps Enter from adding a line in an editable cell', async function () {
    const { page } = viewer;
    await page.evaluate(() => {
      const cell = document.createElement('div');
      cell.id = 'editable-cell';
      cell.setAttribute('contenteditable', 'true');
      cell.textContent = 'Cerebrum';
      document.body.appendChild(cell);
    });
    await page.focus('#editable-cell');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('x');
    assert.strictEqual(await page.$eval('#editable-cell', (el) => el.innerHTML), 'Cerebrumx', 'no line break was inserted');
  }).timeout(U.longTimeout);

  it('reports a measured length in the chat when Enter is pressed', async function () {
    const { page } = viewer;
    const result = await page.evaluate(() => {
      const me = AtlasMakerWidget;
      me.User.measureLength = [{ x: 0, y: 0 }, { x: 3, y: 4 }];
      document.activeElement.blur();

      return { wdim: me.brainWdim, hdim: me.brainHdim, before: document.querySelector('#logChat .text').innerHTML };
    });
    await page.keyboard.press('Enter');
    const after = await page.evaluate(() => ({
      text: document.querySelector('#logChat .text').innerHTML,
      measure: AtlasMakerWidget.User.measureLength
    }));
    const length = Math.sqrt(((3 * result.wdim) ** 2) + ((4 * result.hdim) ** 2));
    assert.strictEqual(after.text, `${result.before}Length: ${length}<br>`);
    assert.isNull(after.measure, 'the measurement is finished');
  }).timeout(U.longTimeout);

  it('uploads a volume of the right size into the annotation, through a hidden file input', async function () {
    const { page } = viewer;
    const [chooser] = await Promise.all([
      page.waitForFileChooser({ timeout: U.shortTimeout }),
      page.evaluate(() => AtlasMakerWidget.upload())
    ]);
    const input = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('body > input[type=file]')];

      return inputs.map((el) => ({ display: el.style.display }));
    });
    assert.deepEqual(input, [{ display: 'none' }], 'one hidden file input, in the body');

    const before = await page.evaluate(() => AtlasMakerWidget.atlas.data.reduce((n, v) => n + (v ? 1 : 0), 0));
    await chooser.accept([BERT_FILE]);
    await page.waitForFunction(() => !document.querySelector('body > input[type=file]'), { timeout: U.mediumTimeout });
    await page.waitForFunction((n) => AtlasMakerWidget.atlas.data.reduce((m, v) => m + (v ? 1 : 0), 0) !== n, { timeout: U.mediumTimeout }, before);
    const sample = await page.evaluate(() => {
      const { data } = AtlasMakerWidget.atlas;
      const i = data.findIndex((v) => v > 0);

      return { found: i >= 0 };
    });
    assert.isTrue(sample.found, 'the annotation now holds the uploaded volume');
  }).timeout(U.longTimeout);
});
