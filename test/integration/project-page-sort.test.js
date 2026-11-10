/* eslint-disable max-lines */
/* global AtlasMakerWidget BrainBox */
'use strict';

/*
  The project page's files table sorts by a click on a column header (2026-11-10), as
  microdraw's project page: nwl-components/sort, SortableTh's markup (th.nwl-sortable >
  button.nwl-sort-button > label + icon, aria-sort), Name, File and each text annotation
  sortable, by what their cells show, missing values last both ways, unsorted (the
  project's order) until a header is clicked. A row is its file, not its position: after
  a sort, a click loads that file, an edit saves that file (checked in the stored
  document), ArrowUp/ArrowDown follow the displayed order, and the rows loaded in a later
  page (the page asks for 20 files at a time) land in their sorted place.
  The files are not MRIs: their documents are inserted directly in the database, and the
  page's requests for MRI data are aborted (the viewer shows an error, the tables work).
*/

const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const U = require('../utils.js');

const SHORTNAME = 'projectsorttest';
const PAGE = `${U.serverURL}/project/${SHORTNAME}`;
const NUM_FILES = 23; // more than the 20 of the page's first request
const source = (i) => `${U.testDataURL}/test_data/${SHORTNAME}-${i}.nii.gz`;
// In the project's order, which is none of the sorted ones: names file-00 to file-22
// shuffled (7i mod 23), but files 3 and 21 (in the second page) have none; a Notes text
// for every fourth file; a Choice for every third
const pad = (n) => String(n).padStart(2, '0');
const FILES = Array.from({ length: NUM_FILES }, (_x, i) => ({
  source: source(i),
  name: (i === 3 || i === 21) ? '' : `file-${pad((i * 7) % NUM_FILES)}`,
  notes: (i % 4 === 0) ? `note-${pad((i * 5) % NUM_FILES)}` : null,
  choice: (i % 3 === 0) ? ['yes', 'no', 'maybe'][(i / 3) % 3] : null
}));
const HEADERS = ['Name', 'File', 'Notes', 'Choice', 'Secret'];

const project = () => ({
  name: 'Project page sort test',
  shortname: SHORTNAME,
  url: '',
  brainboxURL: `/project/${SHORTNAME}`,
  created: (new Date()).toJSON(),
  owner: 'foo',
  collaborators: {
    list: [{ userID: 'anyone', access: { collaborators: 'view', annotations: 'edit', files: 'view' } }]
  },
  files: { list: FILES.map((f) => f.source) },
  annotations: {
    list: [
      { type: 'text', values: '', display: 'true', name: 'Notes' },
      { type: 'multiple choices', values: 'yes; no; maybe', display: 'true', name: 'Choice' },
      { type: 'volume', values: 'foreground.json', display: 'true', name: 'Vol A' },
      { type: 'hidden text', values: '', display: 'true', name: 'Secret' }
    ]
  },
  description: 'A project for testing the sorting of the project page.',
  modified: (new Date()).toJSON(),
  modifiedBy: 'foo'
});

const entry = (data) => ({ created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z', modifiedBy: 'foo', type: 'text', data });
const mriDocument = (f) => {
  const annotations = {};
  if (f.notes !== null) { annotations.Notes = entry(f.notes); }
  if (f.choice !== null) { annotations.Choice = entry(f.choice); }

  return {
    filename: `${SHORTNAME}.nii.gz`,
    source: f.source,
    url: `/data/${SHORTNAME}/`,
    included: '2026-01-01T00:00:00.000Z',
    owner: 'foo',
    name: f.name,
    mri: { atlas: [], annotations: { [SHORTNAME]: annotations } }
  };
};

const db = () => U.getNativeDB();
const removeAll = async () => {
  await db().collection('project')
    .deleteMany({ shortname: SHORTNAME });
  await db().collection('mri')
    .deleteMany({ source: { $in: FILES.map((f) => f.source) } });
};
const storedNotes = async (i) => {
  const doc = await db().collection('mri')
    .findOne({ source: source(i), backup: { $exists: false } });

  return doc && doc.mri && doc.mri.annotations && doc.mri.annotations[SHORTNAME] && doc.mri.annotations[SHORTNAME].Notes
    ? doc.mri.annotations[SHORTNAME].Notes.data
    : null;
};

// The files in the order a sort by `value` shows them, missing values last both ways
const sortedFiles = (value, ascending = true) => {
  const indices = FILES.map((_f, i) => i);
  const has = indices.filter((i) => value(FILES[i]) !== null && value(FILES[i]) !== '');
  const missing = indices.filter((i) => !has.includes(i));
  has.sort((a, b) => (ascending ? 1 : -1) * value(FILES[a]).localeCompare(value(FILES[b])));

  return [...has, ...missing];
};
const shownName = (i) => FILES[i].name;

/**
 * Open the project page. Requests outside our server and for MRI data are aborted; the
 * request for the files from the 20th on is held until `release()` is called, if `hold`.
 * @param {Object} browser A puppeteer browser
 * @param {boolean} [hold] Hold the second page of files
 * @returns {Promise<Object>} { page, pageErrors, release }
 */
const openPage = async (browser, hold = false) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  let held = null;
  let released = !hold;
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (!U.isLocalURL(url) || (!req.isNavigationRequest() && (url.includes('/mri/json') || url.includes('.nii.gz')))) {
      req.abort();
    } else if (!released && url.includes(`/project/json/${SHORTNAME}/files`) && url.includes('start=20')) {
      held = req;
    } else {
      req.continue();
    }
  });
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    (n) => document.querySelectorAll('#projectFiles tbody tr').length === n,
    { timeout: U.longTimeout },
    hold ? 20 : NUM_FILES
  );
  const release = async () => {
    released = true;
    if (held) { await held.continue(); }
  };

  return { page, pageErrors, release };
};

// Record, instead of carrying out, the loading of a file
const recordLoads = (page) => page.evaluate(() => {
  window.__loaded = [];
  BrainBox.configureBrainBox = (params) => {
    window.__loaded.push(params.url);

    return new Promise(() => null);
  };
});

// eslint-disable-next-line max-statements
describe('Project page: sortable files table', function () {
  let browser;
  let opened;

  // the Name of every row, top to bottom
  const names = () => opened.page.$$eval('#projectFiles tbody tr', (trs) => trs.map((tr) => tr.cells[0].textContent));
  const ariaSorts = () => opened.page.$$eval('#projectFiles thead th', (ths) => ths.map((th) => th.getAttribute('aria-sort')));
  const button = (label) => `#projectFiles thead th:nth-child(${HEADERS.indexOf(label) + 1}) button.nwl-sort-button`;
  const clickHeader = (label) => opened.page.click(button(label));
  const selectedRow = () => opened.page.$$eval('#projectFiles tbody tr', (trs) => trs.findIndex((tr) => tr.classList.contains('selected')));
  const shown = (order) => order.map(shownName);

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    await removeAll();
    await db().collection('project')
      .insertOne(project());
    await db().collection('mri')
      .insertMany(FILES.map(mriDocument));
    browser = await puppeteer.launch({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  });

  afterEach(async function () {
    if (opened && opened.page) { await opened.page.close(); }
    opened = null;
  });

  after(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    if (browser) { await browser.close(); }
    await removeAll();
  });

  it('has SortableTh\'s headers, every column sortable, and the project\'s order until a click', async function () {
    opened = await openPage(browser);
    const headers = await opened.page.$$eval('#projectFiles thead th', (ths) => ths.map((th) => {
      const btn = th.querySelector(':scope > button.nwl-sort-button');
      const svg = btn && btn.querySelector(':scope > svg.nwl-sort-indicator');

      return {
        text: th.textContent.trim(),
        sortable: th.classList.contains('nwl-sortable'),
        type: btn && btn.getAttribute('type'),
        label: btn && btn.querySelector(':scope > span.nwl-sort-label').textContent,
        icon: svg && svg.getAttribute('data-state'),
        iconColor: svg && getComputedStyle(svg).color,
        iconWidth: svg && getComputedStyle(svg).width
      };
    }));
    assert.deepEqual(headers.map((h) => h.text), HEADERS);
    for (const h of headers) {
      assert.deepEqual(h, { text: h.text, sortable: true, type: 'button', label: h.text, icon: 'none', iconColor: 'rgb(122, 122, 122)', iconWidth: h.iconWidth }, h.text);
      assert.match(h.iconWidth, /^[\d.]+px$/);
    }
    assert.deepEqual(await ariaSorts(), HEADERS.map(() => 'none'));
    assert.deepEqual(await names(), FILES.map((f) => f.name), 'the project\'s order');
    assert.deepEqual(opened.pageErrors, []);
  }).timeout(U.longTimeout);

  it('sorts by Name ascending, then descending, missing names last both ways, with aria-sort', async function () {
    opened = await openPage(browser);
    await clickHeader('Name');
    assert.deepEqual(await names(), shown(sortedFiles((f) => f.name)));
    assert.deepEqual(await ariaSorts(), ['ascending', 'none', 'none', 'none', 'none']);
    await clickHeader('Name');
    assert.deepEqual(await names(), shown(sortedFiles((f) => f.name, false)));
    assert.deepEqual((await names()).slice(-2), ['', ''], 'missing last');
    assert.deepEqual(await ariaSorts(), ['descending', 'none', 'none', 'none', 'none']);
    await clickHeader('Choice');
    const choices = await opened.page.$$eval('#projectFiles tbody tr', (trs) => trs.map((tr) => tr.cells[3].querySelector('select').value));
    assert.deepEqual(choices, sortedFiles((f) => f.choice).map((i) => FILES[i].choice || ''));
    assert.deepEqual(await ariaSorts(), ['none', 'none', 'none', 'ascending', 'none']);
    assert.deepEqual(opened.pageErrors, []);
  }).timeout(U.longTimeout);

  it('sorts with Enter and Space on a header\'s button', async function () {
    opened = await openPage(browser);
    await opened.page.focus(button('Notes'));
    await opened.page.keyboard.press('Enter');
    const notes = () => opened.page.$$eval('#projectFiles tbody tr', (trs) => trs.map((tr) => tr.cells[2].textContent));
    assert.deepEqual(await notes(), sortedFiles((f) => f.notes).map((i) => FILES[i].notes || ''));
    assert.deepEqual(await ariaSorts(), ['none', 'none', 'ascending', 'none', 'none']);
    await opened.page.keyboard.press('Space');
    assert.deepEqual(await notes(), sortedFiles((f) => f.notes, false).map((i) => FILES[i].notes || ''));
    assert.deepEqual(await ariaSorts(), ['none', 'none', 'descending', 'none', 'none']);
  }).timeout(U.longTimeout);

  it('loads the file of the row clicked after a sort', async function () {
    opened = await openPage(browser);
    await recordLoads(opened.page);
    await clickHeader('Name');
    const order = sortedFiles((f) => f.name);
    await opened.page.click('#projectFiles tbody tr:nth-child(3) td:nth-child(1)');
    assert.notStrictEqual(order[2], 2, 'the row is not at its file\'s position');
    assert.deepEqual(await opened.page.evaluate(() => window.__loaded), [source(order[2])]);
    assert.strictEqual(await selectedRow(), 2);
    assert.deepEqual(opened.pageErrors, []);
  }).timeout(U.longTimeout);

  it('moves to the previous and next rows in the displayed order with the arrow keys, wrapping around', async function () {
    opened = await openPage(browser);
    await recordLoads(opened.page);
    await clickHeader('Name');
    await clickHeader('Name'); // descending: the first row is not the file selected at first
    const order = sortedFiles((f) => f.name, false);
    assert.notStrictEqual(order[0], 0);
    await opened.page.click('#projectFiles tbody tr:nth-child(1) td:nth-child(1)');
    await opened.page.evaluate(() => document.activeElement && document.activeElement.blur());
    const steps = [['ArrowDown', 1], ['ArrowDown', 2], ['ArrowUp', 1], ['ArrowUp', 0], ['ArrowUp', NUM_FILES - 1]];
    for (const [key, position] of steps) {
      // eslint-disable-next-line no-await-in-loop
      await opened.page.keyboard.press(key);
      // eslint-disable-next-line no-await-in-loop
      assert.strictEqual(await selectedRow(), position, `after ${key}`);
    }
    assert.deepEqual(await opened.page.evaluate(() => window.__loaded), [0, 1, 2, 1, 0, NUM_FILES - 1].map((p) => source(order[p])));
  }).timeout(U.longTimeout);

  // eslint-disable-next-line max-statements
  it('saves an edit made after a sort to that row\'s file, in the stored document, and keeps the row in place', async function () {
    opened = await openPage(browser);
    await recordLoads(opened.page);
    await opened.page.waitForFunction(() => AtlasMakerWidget.flagConnected === 1, { timeout: U.mediumTimeout });
    await clickHeader('Notes');
    await clickHeader('Notes'); // descending: the first row is not the first file
    const order = sortedFiles((f) => f.notes, false);
    const [first] = order;
    assert.notStrictEqual(first, 0);
    const cell = '#projectFiles tbody tr:nth-child(1) td:nth-child(3)';
    await opened.page.click(cell);
    await opened.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      const range = document.createRange();
      range.selectNodeContents(el);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    }, cell);
    // a value that sorts last in this order: the row stays where it is until the next sort
    await opened.page.keyboard.type('a-sorted-note');
    await opened.page.keyboard.press('Enter');
    const deadline = Date.now() + U.mediumTimeout;
    // eslint-disable-next-line no-await-in-loop
    while (await storedNotes(first) !== 'a-sorted-note' && Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      await U.delay(100);
    }
    assert.strictEqual(await storedNotes(first), 'a-sorted-note', 'saved to the row\'s file');
    assert.strictEqual(await storedNotes(0), FILES[0].notes, 'not to the file at the row\'s position');
    assert.strictEqual((await names())[0], FILES[first].name, 'the row has not moved');
    await clickHeader('Name');
    await clickHeader('Notes');
    await clickHeader('Notes');
    const notes = await opened.page.$$eval('#projectFiles tbody tr', (trs) => trs.map((tr) => tr.cells[2].textContent));
    assert.strictEqual(notes.indexOf('a-sorted-note'), order.filter((i) => FILES[i].notes !== null).length - 1, 'a new sort puts it in its place');
    await db().collection('mri')
      .deleteMany({ source: source(first) });
    await db().collection('mri')
      .insertOne(mriDocument(FILES[first]));
    assert.deepEqual(opened.pageErrors, []);
  }).timeout(U.longTimeout);

  it('puts the rows loaded after a sort at their sorted place', async function () {
    opened = await openPage(browser, true);
    await clickHeader('Name');
    const firstPage = sortedFiles((f) => f.name).filter((i) => i < 20);
    assert.deepEqual(await names(), shown(firstPage));
    await opened.release();
    await opened.page.waitForFunction(
      (n) => document.querySelectorAll('#projectFiles tbody tr').length === n,
      { timeout: U.mediumTimeout },
      NUM_FILES
    );
    assert.deepEqual(await names(), shown(sortedFiles((f) => f.name)));
    assert.deepEqual(await ariaSorts(), ['ascending', 'none', 'none', 'none', 'none']);
    assert.deepEqual(opened.pageErrors, []);
  }).timeout(U.longTimeout);
});
