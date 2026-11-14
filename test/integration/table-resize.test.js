/* global AtlasMakerWidget */
'use strict';

/*
  Resizable table columns (UI kit step 15, nwl-components 3.1.0): every table with a row of
  column headers has a handle at the right edge of each header. The project page's files and
  volume annotations tables and the MRI page's volume and text annotations tables use
  nwl-components/resize; the user and project settings pages' tables are nwl-components'
  Table, which resizes by default. The MRI's info table (a header per row) has none. The
  landmarks dialog's table is checked in landmarks-dialog.test.js.
  For each page: before any resize the columns are as wide as without the helper (a copy of
  the table, without its handles and wrapper, laid out next to it); a mouse drag widens
  that column only and does not sort; ArrowRight on a focused handle adds 10px; a reload
  gives the automatic layout again (widths are not remembered).
  The MRI page loads the test brain, which is removed at the end, as the other suites that
  use it do; the other pages' requests for MRI data are aborted.
*/

const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');

const PAGES = {
  project: {
    url: `${U.serverURL}/project/${U.projectTest.shortname}`,
    ready: () => document.querySelector('table#volAnnotations .nwl-col-resize') && document.querySelector('#projectFiles tbody tr'),
    tables: ['#projectFiles table', 'table#volAnnotations'],
    sortable: '#projectFiles table'
  },
  mri: {
    url: `${U.serverURL}/mri?url=${U.localBertURL}`,
    ready: () => window.AtlasMakerWidget && AtlasMakerWidget.isViewerReady() && document.querySelector('table#textAnnotations .nwl-col-resize'),
    tables: ['table#annotations', 'table#textAnnotations'],
    sortable: 'table#annotations',
    loadsMRI: true
  },
  user: {
    url: `${U.serverURL}/user/foo`,
    ready: () => document.querySelector('#projects tbody tr') && document.querySelector('#projects .nwl-col-resize'),
    tables: ['#projects'],
    sortable: '#projects'
  },
  settings: {
    url: `${U.serverURL}/project/${U.projectTest.shortname}/settings`,
    // once the files are loaded: the rows they add can give the page a scrollbar, narrowing the tables
    ready: () => document.querySelector('#access tbody tr') && document.querySelector('#access .nwl-col-resize') &&
      document.querySelector('#files tbody tr') && !document.querySelector('.filesLoading'),
    tables: ['#access', '#annotations', '#files'],
    sortable: '#access'
  }
};

/**
 * Open a page and wait until its tables are ready. Requests outside our server are aborted,
 * and so are the requests for MRI data, unless the page loads the test brain.
 * @param {Object} browser A puppeteer browser
 * @param {Object} p The page (PAGES)
 * @returns {Promise<Object>} { page, pageErrors }
 */
const openPage = async (browser, p) => {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.setViewport({ width: 1400, height: 1000 });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    const mriData = !p.loadsMRI && !req.isNavigationRequest() && (url.includes('/mri/json') || url.includes('.nii.gz'));
    if (!U.isLocalURL(url) || mriData) { req.abort(); } else { req.continue(); }
  });
  await page.goto(p.url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(p.ready, { timeout: U.longTimeout });

  return { page, pageErrors };
};

// each column header of a table: its text, whether it has a handle, its width and aria-sort
const headers = (page, sel) => page.$eval(sel, (table) => [...table.tHead.rows[0].cells].map((th) => ({
  text: th.textContent.trim(),
  handle: th.querySelectorAll(':scope > .nwl-col-resize[role="separator"]').length === 1,
  width: th.getBoundingClientRect().width,
  sort: th.getAttribute('aria-sort')
})));

// the widths of a table's columns, and of the columns of a copy of it laid out next to it
// without the helper (no handles, no nwl-resizable class, no wrapper)
const widthsWithAndWithoutHelper = (page, sel) => page.$eval(sel, (table) => {
  // the copy keeps the id (for a moment), which the page's CSS selects some tables by
  const copy = table.cloneNode(true);
  copy.querySelectorAll('.nwl-col-resize').forEach((handle) => handle.remove());
  copy.querySelectorAll('th').forEach((th) => th.classList.remove('nwl-resizable'));
  (table.closest('.nwl-resize-wrap') || table).before(copy);
  const widths = (t) => [...t.tHead.rows[0].cells].map((th) => th.getBoundingClientRect().width);
  const result = { on: widths(table), off: widths(copy) };
  copy.remove();

  return result;
});

// whether a table has its own layout (the files and annotations tables' CSS gives them
// table-layout: fixed, the others auto): not resized, no frozen widths, the wrapper with no box
const automatic = (page, sel) => page.$eval(sel, (table) => !table.classList.contains('nwl-resized') &&
  [...table.tHead.rows[0].cells].every((th) => th.style.boxSizing === '') &&
  !table.closest('.nwl-resize-wrap').classList.contains('nwl-resize-active'));

const rowOrder = (page, sel) => page.$eval(sel, (table) => [...table.tBodies[0].rows].map((tr) => tr.textContent));

const handleSelector = (sel, col) => `${sel} thead th:nth-child(${col + 1}) > .nwl-col-resize`;

/**
 * Drag a column's handle with the mouse
 * @param {Object} page A puppeteer page
 * @param {string} sel The table
 * @param {number} col The column
 * @param {number} dx The distance, in px
 * @returns {Promise<void>} Resolves once the mouse is released
 */
const drag = async (page, sel, col, dx) => {
  const handle = await page.$(handleSelector(sel, col));
  await handle.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
  const box = await handle.boundingBox();
  const x = box.x + (box.width / 2);
  const y = box.y + (box.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + (dx / 2), y, { steps: 3 });
  await page.mouse.move(x + dx, y, { steps: 3 });
  await page.mouse.up();
};

const checkHandlesAndWidths = async (page, p) => {
  for (const sel of p.tables) {
    // eslint-disable-next-line no-await-in-loop
    const hs = await headers(page, sel);
    assert.isAbove(hs.length, 0, `${sel} has column headers`);
    assert.deepEqual(hs.filter((h) => !h.handle).map((h) => h.text), [], `every header of ${sel} has one handle`);
    // eslint-disable-next-line no-await-in-loop
    assert.isTrue(await automatic(page, sel), `${sel} has its automatic layout`);
    // eslint-disable-next-line no-await-in-loop
    const { on, off } = await widthsWithAndWithoutHelper(page, sel);
    on.forEach((w, i) => assert.approximately(w, off[i], 0.5, `${sel}, column ${i}: as wide as without the helper`));
  }
  // key/value tables (a header per row), such as the MRI's info table, have no handles
  assert.strictEqual(await page.$$eval('table:not(:has(thead)) .nwl-col-resize', (hs) => hs.length), 0, 'no handles in key/value tables');
};

// a drag widens that column only, without sorting
const checkDrag = async (page, sel) => {
  const before = await headers(page, sel);
  const rows = await rowOrder(page, sel);
  await drag(page, sel, 0, 60);
  const dragged = await headers(page, sel);
  assert.approximately(dragged[0].width, Math.round(before[0].width) + 60, 1, 'the dragged column is 60px wider');
  dragged.slice(1).forEach((h, i) => assert.approximately(h.width, before[i + 1].width, 1, `column ${i + 1} keeps its width`));
  assert.isTrue(await page.$eval(sel, (table) => table.classList.contains('nwl-resized') && getComputedStyle(table).tableLayout === 'fixed'), 'fixed layout');
  assert.deepEqual(dragged.map((h) => h.sort), before.map((h) => h.sort), 'a drag does not sort');
  assert.deepEqual(await rowOrder(page, sel), rows, 'the rows keep their order');
};

// ArrowRight on a focused handle adds 10px to its column only
const checkArrow = async (page, sel) => {
  const before = await headers(page, sel);
  await page.focus(handleSelector(sel, 1));
  await page.keyboard.press('ArrowRight');
  const after = await headers(page, sel);
  assert.approximately(after[1].width, Math.round(before[1].width) + 10, 1, 'ArrowRight adds 10px');
  assert.approximately(after[0].width, before[0].width, 1, 'the other columns keep their width');
};

// a reload gives the automatic layout again
const checkReload = async (page, p) => {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(p.ready, { timeout: U.longTimeout });
  assert.isTrue(await automatic(page, p.sortable), 'a reload gives the automatic layout');
  const { on, off } = await widthsWithAndWithoutHelper(page, p.sortable);
  on.forEach((w, i) => assert.approximately(w, off[i], 0.5, `after a reload, column ${i}: as wide as without the helper`));
};

/**
 * Open a page and check its tables: handles, widths, a drag, ArrowRight, a reload
 * @param {Object} browser A puppeteer browser
 * @param {Object} p The page (PAGES)
 * @returns {Promise<void>} Resolves once checked and closed
 */
const checkPage = async (browser, p) => {
  const opened = await openPage(browser, p);
  try {
    await checkHandlesAndWidths(opened.page, p);
    await checkDrag(opened.page, p.sortable);
    await checkArrow(opened.page, p.sortable);
    await checkReload(opened.page, p);
    assert.deepEqual(opened.pageErrors, []);
  } finally {
    await opened.page.close();
  }
};

describe('Resizable table columns', function () {
  let browser;

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    browser = await puppeteer.launch({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
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

  it('project page: the files and volume annotations tables', async function () {
    await checkPage(browser, PAGES.project);
  }).timeout(U.longTimeout * 2);

  it('MRI page: the volume and text annotations tables, not the info table', async function () {
    await checkPage(browser, PAGES.mri);
  }).timeout(U.longTimeout * 2);

  it('user page: the projects table (nwl-components Table)', async function () {
    await checkPage(browser, PAGES.user);
  }).timeout(U.longTimeout * 2);

  it('project settings page: the access, annotations and files tables (nwl-components Table)', async function () {
    await checkPage(browser, PAGES.settings);
  }).timeout(U.longTimeout * 2);
});
