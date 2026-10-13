/* global AtlasMakerWidget */
'use strict';

/*
  Browser tests for the landmarks dialog of view/atlasmaker/src/atlasmaker-interaction.js
  (landmarkClick): labels typed in the table are saved, Cancel discards them, removing the
  last landmark leaves an empty table, and labels are shown as text, never as markup (in
  the table and on the slice).
*/

const puppeteer = require('puppeteer');
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

  return { page, pageErrors };
};

/**
 * Give the viewer some landmarks, keep what is sent to the server in window.sentVectorial
 * instead of sending it, and open the landmarks dialog.
 * @param {Object} page A puppeteer page
 * @param {Array} vectorial The landmarks
 * @returns {Promise} Resolves once the dialog is open
 */
const openDialog = (page, vectorial) => page.evaluate((v) => {
  const me = AtlasMakerWidget;
  window.sentVectorial = [];
  me.sendVectorialAnnotationMessage = (msg) => { window.sentVectorial.push(JSON.parse(JSON.stringify(msg))); };
  me.User.vectorial = v;
  me.landmarkClick();
}, vectorial);

const labelCells = (page) => page.$$eval('#landmarksDialog tbody tr', (rows) => rows.map((tr) => tr.cells[0].textContent));

const typeInLabel = async (page, row, text) => {
  await page.click(`#landmarksDialog tbody tr:nth-child(${row + 1}) td:first-child`);
  await page.keyboard.type(text);
};

const LANDMARKS = [
  { type: 'text', position: [10, 20, 30, 0], text: '' },
  { type: 'text', position: [11, 21, 31, 0], text: 'pons' }
];

describe('TESTING THE LANDMARKS DIALOG', function () {
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

  it('saves the labels typed in the table', async function () {
    const { page } = viewer;
    await openDialog(page, LANDMARKS);
    assert.deepEqual(await labelCells(page), ['', 'pons']);
    await typeInLabel(page, 0, 'corpus callosum');
    await page.click('#landmarksDialogOk');
    const result = await page.evaluate(() => ({
      sent: window.sentVectorial,
      vectorial: AtlasMakerWidget.User.vectorial,
      display: document.querySelector('#landmarksDialog').style.display
    }));
    assert.strictEqual(result.display, 'none', 'the dialog is closed');
    assert.lengthOf(result.sent, 1, 'the landmarks are sent once');
    assert.deepEqual(result.sent[0].map((a) => a.text), ['corpus callosum', 'pons']);
    assert.deepEqual(result.sent[0].map((a) => a.position), LANDMARKS.map((a) => a.position), 'positions are unchanged');
    assert.deepEqual(result.vectorial, result.sent[0]);
    assert.deepEqual(viewer.pageErrors, []);
  }).timeout(U.longTimeout);

  it('discards the typed labels on Cancel', async function () {
    const { page } = viewer;
    await openDialog(page, LANDMARKS);
    await typeInLabel(page, 0, 'corpus callosum');
    await page.click('#landmarksDialogCancel');
    const result = await page.evaluate(() => ({
      sent: window.sentVectorial,
      vectorial: AtlasMakerWidget.User.vectorial,
      display: document.querySelector('#landmarksDialog').style.display
    }));
    assert.strictEqual(result.display, 'none');
    assert.deepEqual(result.sent, []);
    assert.deepEqual(result.vectorial, LANDMARKS);
  }).timeout(U.longTimeout);

  it('keeps the labels typed before a landmark is removed', async function () {
    const { page } = viewer;
    await openDialog(page, LANDMARKS);
    await typeInLabel(page, 0, 'corpus callosum');
    await page.click('#landmarksDialog tbody tr:nth-child(2) td:nth-child(2)');
    await page.click('#removeLandmark');
    assert.deepEqual(await labelCells(page), ['corpus callosum']);
    await page.click('#landmarksDialogOk');
    const sent = await page.evaluate(() => window.sentVectorial);
    assert.deepEqual(sent, [[{ ...LANDMARKS[0], text: 'corpus callosum' }]]);
  }).timeout(U.longTimeout);

  it('removes the last landmark, leaving an empty table, and saves that', async function () {
    const { page } = viewer;
    await openDialog(page, [LANDMARKS[1]]);
    await page.click('#removeLandmark');
    assert.deepEqual(await labelCells(page), []);
    await page.click('#landmarksDialogOk');
    assert.deepEqual(await page.evaluate(() => window.sentVectorial), [[]]);
    assert.deepEqual(viewer.pageErrors, []);
  }).timeout(U.longTimeout);

  it('opens with no landmarks, and closes again', async function () {
    const { page } = viewer;
    await openDialog(page, []);
    assert.deepEqual(await labelCells(page), []);
    await page.click('#landmarksDialogCancel');
    assert.strictEqual(await page.$eval('#landmarksDialog', (el) => el.style.display), 'none');
    assert.deepEqual(viewer.pageErrors, []);
  }).timeout(U.longTimeout);

  it('shows labels as text, in the table and on the slice', async function () {
    const { page } = viewer;
    const text = '<b>x</b> & <img src=x onerror="window.injected=1">';
    const result = await page.evaluate((t) => {
      const me = AtlasMakerWidget;
      me.User.vectorial = [{ type: 'text', position: [0, 0, 0, 0], text: t }];
      me._voxelCoord2ScreenCoord = () => [5, 5, me.User.slice];
      // put in the page as atlasmaker-draw.js does, through innerHTML
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.innerHTML = me.landmarkToolDisplayInformation('');

      return {
        svgText: svg.querySelector('text').textContent,
        svgElements: [...svg.querySelectorAll('*')].map((el) => el.tagName)
      };
    }, text);
    assert.strictEqual(result.svgText, text);
    assert.deepEqual(result.svgElements, ['g', 'path', 'text'], 'no element comes from the label');

    await openDialog(page, [{ type: 'text', position: [1, 2, 3, 0], text }]);
    assert.deepEqual(await labelCells(page), [text]);
    assert.isUndefined(await page.evaluate(() => window.injected));
  }).timeout(U.longTimeout);

  it('shows a missing label as an empty cell', async function () {
    const { page } = viewer;
    await openDialog(page, [{ type: 'text', position: [1, 2, 3, 0], text: null }]);
    assert.deepEqual(await labelCells(page), ['']);
  }).timeout(U.longTimeout);
});
