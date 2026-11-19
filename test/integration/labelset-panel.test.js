/* global AtlasMakerWidget */
'use strict';

/*
  Browser tests for the viewer's label set panel (#labelset, view/atlasmaker/src/html/toolsFull.html),
  nwl-components' .nwl-panel (3.2.0): with the 197 labels of rhesus_cortical.json, the labels
  scroll in the panel's body, and the header, with its close button, stays at the top after
  scrolling to the bottom. Before, the whole panel scrolled and the close button went with it.
  It opens with the toolbar's colour button and closes with its close button, or by choosing a label.
*/

const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');

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
  // the 197 labels of the rhesus cortical label set, as when the atlas uses it
  await page.evaluate(async () => {
    AtlasMakerWidget.configureOntology(await (await fetch('/labels/rhesus_cortical.json')).json());
  });

  return { page, pageErrors };
};

const displayOf = (page) => page.$eval('#labelset', (el) => getComputedStyle(el).display);

// the panel's body scrolled to the bottom: where the header and its close button are
const scrolledToBottom = (page) => page.$eval('#labelset', (panel) => {
  const header = panel.querySelector(':scope > .nwl-panel-header');
  const body = panel.querySelector(':scope > .nwl-panel-body');
  const close = panel.querySelector('#labels-close');
  body.scrollTop = body.scrollHeight;
  const [p, h, b, c] = [panel, header, body, close].map((el) => el.getBoundingClientRect());
  const hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);

  return {
    labels: panel.querySelectorAll('#label-list > div').length,
    overflows: body.scrollHeight > body.clientHeight,
    scrolled: body.scrollTop > 0,
    panelScroll: panel.scrollTop,
    headerTop: Math.round(h.top - p.top),
    bodyBelowHeader: b.top >= h.bottom - 0.5,
    closeInHeader: c.top >= h.top && c.bottom <= h.bottom + 0.5,
    closeOnTop: hit === close
  };
});

describe('TESTING THE LABEL SET PANEL', function () {
  let browser;
  let viewer;

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    browser = await U.launchBrowser({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
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

  it('keeps its header and close button at the top after its 197 labels are scrolled to the bottom', async function () {
    const { page, pageErrors } = viewer;
    await page.click('#color');
    assert.strictEqual(await displayOf(page), 'flex');
    assert.deepEqual(await scrolledToBottom(page), {
      labels: 197,
      overflows: true,
      scrolled: true,
      panelScroll: 0,
      headerTop: 0,
      bodyBelowHeader: true,
      closeInHeader: true,
      closeOnTop: true
    });
    assert.deepEqual(pageErrors, []);
  }).timeout(U.longTimeout);

  it('closes with its close button, scrolled, and opens again; choosing a label closes it', async function () {
    const { page, pageErrors } = viewer;
    await page.click('#color');
    await scrolledToBottom(page);
    await page.click('#labels-close');
    assert.strictEqual(await displayOf(page), 'none');
    // again (a second click within 200ms of the first is taken for a double click)
    await page.evaluate(() => AtlasMakerWidget.color());
    assert.strictEqual(await displayOf(page), 'flex');
    await page.click('#label-list > div:nth-child(3)');
    assert.strictEqual(await displayOf(page), 'none');
    assert.strictEqual(await page.evaluate(() => AtlasMakerWidget.User.penValue), 3);
    assert.deepEqual(pageErrors, []);
  }).timeout(U.longTimeout);
});
