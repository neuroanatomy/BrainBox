/* eslint-disable max-lines */
/* global AtlasMakerWidget BrainBox */
'use strict';

/*
  Browser tests for the project page script (view/brainbox/src/pages/project-page.js): the
  files table (a column per text annotation, a link per file, first file selected), moving
  between files with clicks and the arrow keys, editing a file's name or an annotation and
  saving it, choosing a volume annotation, the panel resize handle, the double-tap handling
  on touch screens, and the header buttons. Loading files, saving and switching annotations
  are recorded instead of being carried out, so that the tests only observe the page script.
*/

const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');

const SHORTNAME = 'projectpagetest';
const FILES = [
  { source: U.localBertURL, name: 'bert_brain' },
  { source: `${U.testDataURL}/test_data/not_a_brain.nii.gz`, name: 'second' }
];
const project = () => ({
  name: 'Project page test',
  shortname: SHORTNAME,
  url: '',
  brainboxURL: `/project/${SHORTNAME}`,
  created: (new Date()).toJSON(),
  owner: 'foo',
  collaborators: {
    list: [
      {
        userID: 'anyone',
        nickname: 'anyone',
        username: 'anyone',
        name: 'Any User',
        access: { collaborators: 'view', annotations: 'edit', files: 'view' }
      }
    ]
  },
  files: { list: FILES.map((f) => ({ ...f })) },
  annotations: {
    list: [
      { type: 'volume', values: 'foreground.json', display: 'true', name: 'Vol A' },
      { type: 'text', values: '', display: 'true', name: 'Notes' },
      { type: 'multiple choices', values: 'yes; no; maybe', display: 'true', name: 'Choice' },
      { type: 'volume', values: 'cerebellum.json', display: 'true', name: 'Vol B' },
      { type: 'hidden text', values: '', display: 'true', name: 'Secret' }
    ]
  },
  description: 'A project for testing the project page script.',
  modified: (new Date()).toJSON(),
  modifiedBy: 'foo'
});

const PAGE = `${U.serverURL}/project/${SHORTNAME}`;

const openProjectPage = async (browser) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000, hasTouch: true });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await U.blockExternalRequests(page);
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    (n) => document.querySelectorAll('#projectFiles tbody tr').length === n &&
      document.querySelector('#tools > #tools-side') && document.querySelectorAll('table#volAnnotations tbody tr').length === 2,
    { timeout: U.longTimeout },
    FILES.length
  );
  // Record, instead of carrying out, loading a file, saving, and switching annotation
  await page.evaluate(() => {
    window.__loaded = [];
    window.__saved = [];
    window.__configured = [];
    BrainBox.configureBrainBox = (params) => {
      window.__loaded.push(params.url);

      return new Promise(() => null);
    };
    AtlasMakerWidget.sendSaveMetadataMessage = (info) => { window.__saved.push(JSON.parse(JSON.stringify(info))); };
    AtlasMakerWidget.configureAtlasMaker = (info, index) => {
      window.__configured.push(index);

      return new Promise(() => null);
    };
  });

  return { page, pageErrors };
};

const selectedFileRow = (page) => page.$$eval('#projectFiles tbody tr', (rows) => rows.findIndex((tr) => tr.classList.contains('selected')));
const record = (page, name) => page.evaluate((n) => window[n], name);

// eslint-disable-next-line max-statements
describe('TESTING THE PROJECT PAGE SCRIPT (project-page.js)', function () {
  let browser;
  let opened;

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    await U.removeProject(SHORTNAME);
    await U.insertProject(project());
    browser = await puppeteer.launch({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  });

  beforeEach(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout * 2);
    opened = await openProjectPage(browser);
  });

  afterEach(async function () {
    if (opened && opened.page) { await opened.page.close(); }
    opened = null;
  });

  after(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    if (browser) { await browser.close(); }
    await U.removeProject(SHORTNAME);
    for (const f of FILES) {
      // eslint-disable-next-line no-await-in-loop
      const res = await chai.request(U.serverURL).get('/mri/json')
        .query({ url: f.source });
      if (res.body && res.body.url) {
        // eslint-disable-next-line no-await-in-loop
        await U.removeMRI({ dirPath: './public' + res.body.url, srcURL: f.source });
      }
    }
  });

  it('builds the files table: a column per text annotation, a link per file, the first file selected', async function () {
    const { page } = opened;
    const table = await page.evaluate(() => ({
      headers: [...document.querySelectorAll('#projectFiles thead th')].map((th) => th.textContent.trim()),
      rows: [...document.querySelectorAll('#projectFiles tbody tr')].map((tr) => ({
        name: tr.cells[0].textContent,
        editable: tr.cells[0].getAttribute('contenteditable'),
        href: tr.cells[1].querySelector('a').getAttribute('href'),
        link: tr.cells[1].querySelector('a').innerHTML,
        cells: tr.cells.length
      })),
      volumes: [...document.querySelectorAll('table#volAnnotations tbody tr')].map((tr) => [...tr.cells].map((td) => td.textContent)),
      toolsMoved: Boolean(document.querySelector('#tools > #tools-side'))
    }));
    assert.deepEqual(table.headers, ['Name', 'File', 'Notes', 'Choice', 'Secret']);
    assert.deepEqual(table.rows, FILES.map((f) => ({
      name: f.name, editable: 'true', href: `${U.serverURL}/mri?url=${f.source}`, link: f.source.split('/').pop(), cells: 5
    })));
    assert.deepEqual(table.volumes, [['Vol A', 'foreground.json'], ['Vol B', 'cerebellum.json']]);
    assert.strictEqual(await selectedFileRow(page), 0);
    assert.isTrue(table.toolsMoved, 'the viewer\'s toolbar is moved into the page\'s tools panel');
    assert.deepEqual(opened.pageErrors, []);
  }).timeout(U.longTimeout);

  it('opens another file when its row is clicked, and not again when it is clicked twice', async function () {
    const { page } = opened;
    // (the name cell: the File cell holds the link, which a click would follow)
    await page.click('#projectFiles tbody tr:nth-child(2) td:nth-child(1)');
    assert.strictEqual(await selectedFileRow(page), 1);
    assert.strictEqual(await page.$eval('table#volAnnotations tbody', (el) => el.innerHTML), '', 'the previous file\'s annotations are cleared');
    await page.click('#projectFiles tbody tr:nth-child(2) td:nth-child(1)');
    assert.deepEqual(await record(page, '__loaded'), [FILES[1].source]);
  }).timeout(U.longTimeout);

  it('moves between files with the arrow keys, wrapping around', async function () {
    const { page } = opened;
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    const steps = [['ArrowDown', 1], ['ArrowDown', 0], ['ArrowUp', 1], ['ArrowUp', 0]];
    for (const [key, expected] of steps) {
      // eslint-disable-next-line no-await-in-loop
      await page.keyboard.press(key);
      // eslint-disable-next-line no-await-in-loop
      assert.strictEqual(await selectedFileRow(page), expected, `after ${key}`);
    }
    assert.deepEqual(await record(page, '__loaded'), [FILES[1].source, FILES[0].source, FILES[1].source, FILES[0].source]);
  }).timeout(U.longTimeout);

  it('saves a renamed file when Enter is pressed, without adding a line', async function () {
    const { page } = opened;
    const cell = '#projectFiles tbody tr:nth-child(1) td:nth-child(1)';
    await page.click(cell);
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      const range = document.createRange();
      range.selectNodeContents(el);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    }, cell);
    await page.keyboard.type('renamed');
    await page.keyboard.press('Enter');
    const after = await page.evaluate((sel) => ({
      html: document.querySelector(sel).innerHTML,
      focused: document.activeElement === document.querySelector(sel),
      saved: window.__saved.map((f) => ({ source: f.source, name: f.name }))
    }), cell);
    assert.strictEqual(after.html, 'renamed', 'no line break');
    assert.isFalse(after.focused, 'Enter leaves the cell');
    assert.deepEqual(after.saved, [{ source: FILES[0].source, name: 'renamed' }]);
  }).timeout(U.longTimeout);

  it('saves when focus leaves an edited cell', async function () {
    const { page } = opened;
    const cell = '#projectFiles tbody tr:nth-child(2) td:nth-child(3)'; // 'Notes', free text
    await page.click(cell);
    await page.keyboard.type('a note');
    await page.click('#projectFiles thead th');
    const saved = await record(page, '__saved');
    assert.strictEqual(saved.length, 1);
    assert.strictEqual(saved[0].source, FILES[1].source);
  }).timeout(U.longTimeout);

  it('saves when a multiple-choice annotation is changed', async function () {
    const { page } = opened;
    const select = '#projectFiles tbody tr:nth-child(1) td:nth-child(4) select'; // 'Choice'
    await page.focus(select);
    await page.select(select, 'maybe');
    const after = await page.evaluate((sel) => ({
      focused: document.activeElement === document.querySelector(sel),
      saved: window.__saved.map((f) => f.source)
    }), select);
    assert.isFalse(after.focused, 'the menu loses focus');
    assert.deepEqual(after.saved, [FILES[0].source]);
  }).timeout(U.longTimeout);

  it('switches to another volume annotation when its row is clicked', async function () {
    const { page } = opened;
    const expected = await page.evaluate(() => BrainBox.info.mri.atlas.findIndex((a) => a.name === 'Vol B' && a.project === 'projectpagetest'));
    assert.isAtLeast(expected, 0);
    // Nothing selected yet: select the first one, then the second
    await page.click('table#volAnnotations tbody tr:nth-child(1) td');
    await page.click('table#volAnnotations tbody tr:nth-child(2) td');
    await page.click('table#volAnnotations tbody tr:nth-child(2) td');
    const state = await page.evaluate(() => ({
      configured: window.__configured,
      selected: [...document.querySelectorAll('table#volAnnotations tbody tr')].map((tr) => tr.classList.contains('selected'))
    }));
    assert.strictEqual(state.configured[state.configured.length - 1], expected);
    assert.deepEqual(state.selected, [false, true]);
  }).timeout(U.longTimeout);

  // eslint-disable-next-line max-statements
  it('widens the left panel by the distance the resize handle is dragged', async function () {
    const { page } = opened;
    const handle = await page.$eval('#resizeButton', (el) => {
      const r = el.getBoundingClientRect();

      return { x: r.left + (r.width / 2), y: r.top + (r.height / 2) };
    });
    const leftWidth = () => page.$eval('#left', (el) => el.getBoundingClientRect().width);
    const before = await leftWidth();
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x + 1, handle.y);
    await page.mouse.move(handle.x + 61, handle.y, { steps: 6 });
    await page.mouse.up();
    const widened = await leftWidth();
    await page.mouse.move(handle.x + 200, handle.y, { steps: 3 });
    assert.closeTo(widened - before, 60, 2, 'follows the drag');
    assert.closeTo(await leftWidth(), widened, 0.5, 'and stops when the button is released');
    assert.match(await page.$eval('#left', (el) => el.style.flexBasis), /^[\d.]+px$/);
  }).timeout(U.longTimeout);

  // eslint-disable-next-line max-statements
  it('turns a double tap into two clicks on what was tapped', async function () {
    const { page } = opened;
    const cdp = await page.target().createCDPSession();
    const target = 'table#volAnnotations thead th';
    await page.evaluate((sel) => {
      window.__clicks = 0;
      document.querySelector(sel).addEventListener('click', () => { window.__clicks += 1; });
    }, target);
    const spot = await page.$eval(target, (el) => {
      const r = el.getBoundingClientRect();

      return { x: r.left + 5, y: r.top + (r.height / 2) };
    });
    const tap = async () => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [spot] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await tap();
    await U.delay(700);
    await tap();
    const singles = await page.evaluate(() => window.__clicks);
    await U.delay(700);
    await tap();
    await U.delay(100);
    await tap();
    const all = await page.evaluate(() => window.__clicks);
    // Each tap may also produce the browser's own click: two single taps give the baseline
    assert.strictEqual((all - singles) - singles, 2, 'a double tap adds two clicks on the tapped element');
    assert.deepEqual(opened.pageErrors, []);
  }).timeout(U.longTimeout);

  it('goes to the new-project and settings pages from the header buttons', async function () {
    const { page } = opened;
    await Promise.all([page.waitForNavigation({ timeout: U.mediumTimeout }), page.click('#settings')]);
    assert.strictEqual(new URL(page.url()).pathname, `/project/${SHORTNAME}/settings`);
    await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#addProject');
    await Promise.all([page.waitForNavigation({ timeout: U.mediumTimeout }), page.click('#addProject')]);
    assert.strictEqual(new URL(page.url()).pathname, '/project/new');
  }).timeout(U.longTimeout);
});
