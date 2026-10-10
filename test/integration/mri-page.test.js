/* eslint-disable max-lines */
/* global AtlasMakerWidget BrainBox infoProxy */
'use strict';

/*
  Browser tests for the MRI page script (view/brainbox/src/pages/mri-page.js): the volume
  annotations table (one row per annotation, a label-set menu, project link, access level,
  first row selected), changing an annotation's label set, selecting a row, the error shown
  when the page gets no MRI information, a failed load, the double-tap handling on touch
  screens, and the "add project" button.
*/

const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');

const MRI_PAGE = `${U.serverURL}/mri?url=${U.localBertURL}`;

/**
 * Open the MRI page. `respond(req)` may answer a local request itself (or return
 * null to let it through); requests outside our server are aborted.
 * @param {Object} browser A puppeteer browser
 * @param {Function} [respond] req => canned answer, or null
 * @param {boolean} [waitForTables] Wait until the page has filled its tables
 * @returns {Promise<Object>} { page, requests, pageErrors }
 */
const openPage = async (browser, respond = () => null, waitForTables = true) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900, hasTouch: true });
  const requests = [];
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (!U.isLocalURL(req.url())) {
      req.abort();

      return;
    }
    requests.push({ method: req.method(), url: req.url() });
    const answer = respond(req);
    if (answer) { req.respond(answer); } else { req.continue(); }
  });
  await page.goto(MRI_PAGE, { waitUntil: 'domcontentloaded' });
  if (waitForTables) {
    await page.waitForFunction(
      () => window.AtlasMakerWidget && AtlasMakerWidget.isViewerReady() && document.querySelector('table#annotations tbody tr'),
      { timeout: U.longTimeout }
    );
  }

  return { page, requests, pageErrors };
};

const annotationRows = (page) => page.$$eval('table#annotations tbody tr', (rows) => rows.map((tr) => {
  const select = tr.querySelector('select');

  return {
    selected: tr.classList.contains('selected'),
    name: tr.cells[0].textContent,
    options: [...select.options].map((o) => o.textContent),
    optionsHTML: select.innerHTML,
    value: select.value,
    selectedIndex: select.selectedIndex,
    project: tr.cells[2].innerHTML,
    accessLevel: tr.querySelector('.access').getAttribute('data-level')
  };
}));

describe('TESTING THE MRI PAGE SCRIPT (mri-page.js)', function () {
  let browser;
  let opened;
  let labelSets;

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    browser = await puppeteer.launch({ headless: true, ignoreHTTPSErrors: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    labelSets = (await chai.request(U.serverURL).get('/api/getLabelsets')).body;
  });

  afterEach(async function () {
    if (opened && opened.page) { await opened.page.close(); }
    opened = null;
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

  it('lists the volume annotations, with a menu of every label set, and selects the first', async function () {
    opened = await openPage(browser);
    const { page } = opened;
    const rows = await annotationRows(page);
    const atlas = await page.evaluate(() => BrainBox.info.mri.atlas.map((a) => ({ name: a.name, labels: a.labels, project: a.project, access: a.access })));
    assert.strictEqual(rows.length, atlas.length);
    assert.isAbove(rows.length, 0);
    const names = labelSets.map((l) => l.name);
    rows.forEach((row, i) => {
      assert.strictEqual(row.name, atlas[i].name);
      assert.deepEqual(row.options, names, 'one option per label set, in order');
      assert.strictEqual(row.optionsHTML, names.map((n) => `<option>${n}</option>`).join(''), 'no stray separators between options');
      assert.strictEqual(row.selectedIndex, labelSets.map((l) => l.source).indexOf(atlas[i].labels));
      assert.strictEqual(row.project, `<a href="/project/${atlas[i].project}">${atlas[i].project}</a>`);
      assert.strictEqual(row.accessLevel, String(['none', 'view', 'edit', 'add', 'remove'].indexOf(atlas[i].access)));
    });
    assert.deepEqual(rows.map((r) => r.selected), rows.map((r, i) => i === 0), 'the first row is selected');
    assert.strictEqual(await page.$eval('#data', (el) => getComputedStyle(el).display), 'block', 'the data panel is shown');
    assert.deepEqual(opened.pageErrors, []);
  }).timeout(U.longTimeout);

  it('switches an annotation to another label set, and recolours the viewer with it', async function () {
    opened = await openPage(browser);
    const { page, requests } = opened;
    const current = await page.$eval('table#annotations tbody tr select', (s) => s.selectedIndex);
    const target = labelSets.findIndex((l, i) => i !== current);
    await page.evaluate(() => {
      window.__calls = [];
      const { configureOntology, changePenColor } = AtlasMakerWidget;
      AtlasMakerWidget.configureOntology = function (json) {
        window.__calls.push(['configureOntology', json.name]);

        return configureOntology.call(this, json);
      };
      AtlasMakerWidget.changePenColor = function (i) {
        window.__calls.push(['changePenColor', i]);

        return changePenColor.call(this, i);
      };
    });
    await page.select('table#annotations tbody tr select', labelSets[target].name);
    await page.waitForFunction(() => window.__calls.length >= 2, { timeout: U.shortTimeout });
    const labels = (await chai.request(U.serverURL).get('/labels/' + labelSets[target].source)).body;
    const after = await page.evaluate(() => ({
      calls: window.__calls,
      bound: infoProxy['mri.atlas.0.labels'],
      state: AtlasMakerWidget.viewerState
    }));
    assert.deepEqual(after.calls, [['configureOntology', labels.name], ['changePenColor', 0]]);
    assert.strictEqual(after.bound, labelSets[target].source, 'the annotation now uses that label set');
    assert.strictEqual(after.state, 'ready');
    assert.isTrue(requests.some((r) => r.method === 'GET' && r.url.endsWith('/labels/' + labelSets[target].source)));
  }).timeout(U.longTimeout);

  it('selects an annotation when its row is clicked', async function () {
    opened = await openPage(browser);
    const { page } = opened;
    await page.evaluate(() => {
      window.__configured = [];
      const { configureAtlasMaker } = AtlasMakerWidget;
      AtlasMakerWidget.configureAtlasMaker = function (info, index) {
        window.__configured.push(index);

        return configureAtlasMaker.call(this, info, index);
      };
      // Nothing selected, so that clicking the first row is a change
      document.querySelectorAll('table#annotations tr.selected').forEach((tr) => tr.classList.remove('selected'));
    });
    await page.click('table#annotations tbody tr td:first-child');
    const state = await page.evaluate(() => ({
      configured: window.__configured,
      selected: [...document.querySelectorAll('table#annotations tbody tr')].map((tr) => tr.classList.contains('selected'))
    }));
    assert.deepEqual(state.configured, [0]);
    assert.strictEqual(state.selected[0], true);
  }).timeout(U.longTimeout);

  it('reports unreadable data when the page gets no MRI information', async function () {
    // Serve the page with an empty mriInfo, as the template would for a file that cannot be read
    const html = (await chai.request(U.serverURL).get('/mri')
      .query({ url: U.localBertURL })).text
      .replace(/var mriInfo = [^\n]*;/, 'var mriInfo = {};');
    assert.include(html, 'var mriInfo = {};');
    opened = await openPage(browser, (req) => (req.url() === MRI_PAGE ? { status: 200, contentType: 'text/html', body: html } : null), false);
    const { page } = opened;
    await page.waitForFunction(() => document.querySelector('#stereotaxic h2'), { timeout: U.mediumTimeout });
    const state = await page.evaluate(() => ({
      first: document.getElementById('stereotaxic').firstElementChild.outerHTML,
      second: document.getElementById('stereotaxic').children[1].outerHTML,
      annotationsPane: document.getElementById('annotationsPane').style.display,
      dataInline: document.getElementById('data').getAttribute('style'),
      data: getComputedStyle(document.getElementById('data')).display
    }));
    assert.deepEqual(state, {
      first: '<h2>ERROR: Cannot read the data.</h2>',
      second: '<p>The file is maybe corrupt?</p>',
      annotationsPane: 'none',
      // Known issue, kept as it was: the script asks to show #data, but the page's CSS (which
      // hides #data) is added as a blob <link> that applies only after the script has run, so
      // at that moment #data does not look hidden, show() sets nothing, and it ends up hidden
      dataInline: null,
      data: 'none'
    });
  }).timeout(U.longTimeout);

  it('logs the error, without breaking the page, when loading fails', async function () {
    opened = await openPage(browser, (req) => (req.url().endsWith('/api/getLabelsets')
      ? { status: 500, contentType: 'application/json', body: '{}' }
      : null), false);
    const { page } = opened;
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') { errors.push(msg.text()); } });
    await page.waitForFunction(() => window.AtlasMakerWidget && AtlasMakerWidget.flagConnected === 1, { timeout: U.longTimeout });
    await U.delay(1000);
    assert.isEmpty(await page.$$('table#annotations tbody tr'), 'nothing was filled in');
    assert.deepEqual(opened.pageErrors, [], 'the failure is caught');
  }).timeout(U.longTimeout);

  // eslint-disable-next-line max-statements
  it('turns a double tap into two clicks, and leaves single taps alone', async function () {
    opened = await openPage(browser);
    const { page } = opened;
    const cdp = await page.target().createCDPSession();
    await page.evaluate(() => {
      window.__bodyClicks = 0;
      document.body.addEventListener('click', (e) => { if (e.target === document.body) { window.__bodyClicks += 1; } });
    });
    const tap = async (x, y) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    // A spot on the page body itself, away from the viewer and tables
    const spot = await page.evaluate(() => ({ x: 5, y: window.innerHeight - 5 }));
    await tap(spot.x, spot.y);
    await U.delay(700);
    await tap(spot.x, spot.y);
    const afterSingles = await page.evaluate(() => window.__bodyClicks);
    await U.delay(700);
    await tap(spot.x, spot.y);
    await U.delay(100);
    await tap(spot.x, spot.y);
    const afterDouble = await page.evaluate(() => window.__bodyClicks);
    // Each tap may also produce the browser's own click: two single taps give the baseline
    assert.strictEqual((afterDouble - afterSingles) - afterSingles, 2, 'a double tap adds two clicks on the body');
    assert.deepEqual(opened.pageErrors, []);
  }).timeout(U.longTimeout);

  it('goes to the new-project page from the "add project" button', async function () {
    opened = await openPage(browser);
    const { page } = opened;
    await Promise.all([
      page.waitForNavigation({ timeout: U.mediumTimeout }),
      page.click('#addProject')
    ]);
    assert.strictEqual(new URL(page.url()).pathname, '/project/new');
  }).timeout(U.longTimeout);
});
