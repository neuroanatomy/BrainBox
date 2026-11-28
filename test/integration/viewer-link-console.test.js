/* global AtlasMakerWidget */
'use strict';

/*
  The MRI viewer's Link button and its script console (T002 F2: A2a D6, D7).
  - Link offers this page's address with `view` and `slice` set once, without
    spaces; the MRI page reads them back (brainbox.js configureBrainBox).
  - The script console's codeflask and consolita are shipped in public/vendor/,
    not requested from unpkg.com or cdn.jsdelivr.net, and the console starts
    even though the window's load event has fired.
*/

const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');

const viewerReady = () => window.AtlasMakerWidget && AtlasMakerWidget.brainImg && AtlasMakerWidget.brainImg.img &&
  AtlasMakerWidget.flagConnected === 1 && AtlasMakerWidget.ontology && AtlasMakerWidget.atlas;

const openViewer = async (browser, query) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900 });
  const requests = [];
  page.on('request', (req) => requests.push(req.url()));
  await U.blockExternalRequests(page);
  await page.goto(`${U.serverURL}/mri?url=${U.localBertURL}${query || ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(viewerReady, { timeout: U.longTimeout });

  return { page, requests };
};

// Open an address in the viewer, once it shows its volume
const openAddress = async (browser, address) => {
  const page = await browser.newPage();
  await U.blockExternalRequests(page);
  await page.goto(address, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(viewerReady, { timeout: U.longTimeout });

  return page;
};

// Press Link, and return the address it offers to copy
const clickLink = (page) => page.evaluate(() => {
  let offered = null;
  window.prompt = (message, value) => { offered = value; };
  document.getElementById('link').click();

  return offered;
});

describe('TESTING THE VIEWER\'S LINK BUTTON AND SCRIPT CONSOLE', function () {
  let browser;
  const pages = [];

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    browser = await U.launchBrowser({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  });

  afterEach(async function () {
    await Promise.all(pages.splice(0).map((p) => p.close()));
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

  it('Link gives view and slice once, and opening it shows that view and slice', async function () {
    // a view and slice already in the address are replaced, not repeated
    const { page } = await openViewer(browser, '&view=sag&slice=10');
    pages.push(page);
    await page.evaluate(() => { AtlasMakerWidget.changeView('axi'); AtlasMakerWidget.changeSlice(57); });
    const link = await clickLink(page);

    assert.isString(link, 'Link should offer an address');
    assert.notInclude(link, ' ');
    const query = new URL(link).searchParams;
    assert.deepStrictEqual(query.getAll('view'), ['axi']);
    assert.deepStrictEqual(query.getAll('slice'), ['57']);
    assert.strictEqual(query.get('url'), U.localBertURL);

    const second = await openAddress(browser, link);
    pages.push(second);
    const state = await second.evaluate(() => ({ view: AtlasMakerWidget.User.view, slice: Number(AtlasMakerWidget.User.slice) }));
    assert.deepStrictEqual(state, { view: 'axi', slice: 57 });
  }).timeout(U.longTimeout * 3);

  it('the script console is local and evaluates 1+1', async function () {
    const { page, requests } = await openViewer(browser);
    pages.push(page);
    await page.waitForSelector('#logScript textarea', { timeout: U.mediumTimeout });

    assert.include(requests, `${U.serverURL}/vendor/codeflask/codeflask.min.js`);
    assert.include(requests, `${U.serverURL}/vendor/consolita/consolita.js`);
    const cdn = requests.filter((u) => (/^https?:\/\/(unpkg\.com|cdn\.jsdelivr\.net)\//u).test(u) &&
      // long-press-event is not vendored yet (not in microdraw's vendor.json)
      !u.includes('/long-press-event@'));
    assert.deepStrictEqual(cdn, []);
    assert.isFalse(requests.some((u) => u.startsWith('https://unpkg.com/')), 'nothing from unpkg.com');

    await page.evaluate(() => {
      document.getElementById('logScript').classList.remove('hidden');
      document.querySelector('#logScript textarea').focus();
    });
    await page.keyboard.type('1+1');
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => document.querySelector('#logScript textarea').value.includes('> 2'),
      { timeout: U.shortTimeout }
    );
  }).timeout(U.longTimeout * 2);

  // T002 K2c: the console's look is nwl-components' widgets.css (3.9.0), scoped to #logScript
  it('the script console has the dark theme: light text on black, wrapping, in the panel\'s font size', async function () {
    const { page } = await openViewer(browser);
    pages.push(page);
    await page.waitForSelector('#logScript .codeflask', { timeout: U.mediumTimeout });
    await page.evaluate(() => AtlasMakerWidget.toggleTextInput('Script'));
    const look = await page.evaluate(() => {
      const token = (name) => {
        const probe = document.createElement('div');
        probe.style.color = `var(${name})`;
        document.body.appendChild(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();

        return value;
      };
      const style = (sel) => getComputedStyle(document.querySelector(sel));
      const flask = style('#logScript .codeflask');
      const textarea = style('#logScript textarea.codeflask__flatten');

      return {
        canvas: token('--nwl-bg-canvas'),
        text: token('--nwl-text'),
        white: token('--nwl-white'),
        background: flask.backgroundColor,
        position: flask.position,
        code: style('#logScript .codeflask__code').color,
        whiteSpace: textarea.whiteSpace,
        caret: textarea.caretColor,
        fontSize: textarea.fontSize,
        flaskFontSize: flask.fontSize
      };
    });
    assert.strictEqual(look.canvas, 'rgb(0, 0, 0)');
    assert.strictEqual(look.background, look.canvas);
    assert.strictEqual(look.position, 'relative');
    assert.strictEqual(look.code, look.text);
    assert.strictEqual(look.whiteSpace, 'pre-wrap');
    assert.strictEqual(look.caret, look.white);
    // the panel's font size (BrainBox's `.text *`), not codeflask's 13px
    assert.strictEqual(look.fontSize, look.flaskFontSize);
    assert.notStrictEqual(look.fontSize, '13px');
  }).timeout(U.longTimeout * 2);
});
