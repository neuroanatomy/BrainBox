/* eslint-disable max-lines */
'use strict';

/*
  Browser tests for the project settings page script (view/brainbox/src/pages/project-settings-page.js):
  the settings are shown right away, and the project's files are added as they arrive, in batches
  of 100, with the progress in the Files heading. Saving tells the server how many files had been
  received, so that it does not replace the stored list with a partial one. A batch that fails is
  retried, and then a Retry button lets the user resume. Saving is recorded instead of being
  carried out.
*/

const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const U = require('../utils.js');

const SHORTNAME = 'settingspagetest';
const NFILES = 250;
// Files without a name and without an MRI entry: inserting the project creates nothing else
const FILES = Array.from({ length: NFILES }, (_, i) => ({ source: `https://example.org/settingspagetest/${i}.nii.gz`, name: '' }));
const project = () => ({
  name: 'Settings page test',
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
        access: { collaborators: 'view', annotations: 'view', files: 'view' }
      }
    ]
  },
  files: { list: FILES.map((f) => ({ ...f })) },
  annotations: { list: [{ type: 'volume', values: 'foreground.json', display: 'true', name: 'Vol' }] },
  description: 'A project for testing the project settings page script.',
  modified: (new Date()).toJSON(),
  modifiedBy: 'foo'
});

const PAGE = `${U.serverURL}/project/${SHORTNAME}/settings`;
const isFilesRequest = (url) => url.includes(`/project/json/${SHORTNAME}/files`);
const isCheckRequest = (url) => url.includes(`/project/json/${SHORTNAME}/labelset-check`);
const isSaveRequest = (req) => req.method() === 'POST' && req.url().endsWith(`/project/json/${SHORTNAME}`);
const startOf = (url) => Number(new URL(url).searchParams.get('start'));

/**
 * Open the settings page. `respond(req)` may answer a request for a batch of files itself,
 * return 'hold' to keep it waiting (it is then added to `held`), or nothing to let it through.
 * Saving is answered with a canned success, and its payload recorded in `saved`. The checks of
 * a label set change are answered by `check(layer, values)`, and recorded in `checks`.
 * @param {Object} browser A puppeteer browser
 * @param {Function} respond Optional handler for the requests for files
 * @param {Function} check Optional handler for the label set checks
 * @returns {Object} The page, its errors, the requests for files, held and saved, and the checks
 */
// eslint-disable-next-line max-statements
const openSettingsPage = async (browser, respond = () => null, check = () => ({ unlabelled: [] })) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  const pageErrors = [];
  const filesRequests = [];
  const held = [];
  const saved = [];
  const checks = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (!U.isLocalURL(url)) { req.abort(); } else if (isCheckRequest(url)) {
      const { layer, values } = Object.fromEntries(new URL(url).searchParams);
      checks.push({ layer, values });
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ layer, values, ...check(layer, values) }) });
    } else if (isSaveRequest(req)) {
      saved.push(JSON.parse(req.postData()).data);
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'Project settings updated.' }) });
    } else if (isFilesRequest(url)) {
      filesRequests.push(url);
      const answer = respond(req);
      if (answer === 'hold') { held.push(req); } else if (answer) { req.respond(answer); } else { req.continue(); }
    } else {
      req.continue();
    }
  });
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });

  return { page, pageErrors, filesRequests, held, saved, checks };
};

const numFiles = (page) => page.$eval('#numFiles', (el) => Number(el.textContent));
const waitForAllFiles = (page) => page.waitForFunction((n) => {
  const el = document.querySelector('#numFiles');
  const heading = document.querySelector('#files') && document.querySelector('#files').parentElement.querySelector('h2');

  return el && Number(el.textContent) === n && heading && heading.textContent.trim() === 'Files';
}, { timeout: U.longTimeout }, NFILES);
const filesHeading = (page) => page.evaluate(() => document.querySelector('#files').parentElement.querySelector('h2').textContent.replace(/\s+/g, ' ').trim());
const filesLocked = (page) => page.evaluate(() => document.querySelector('#files').parentElement.classList.contains('filesLoading'));
const clickButton = (page, text) => page.evaluate((t) => {
  const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
  button.click();
}, text);
const chooseLabelset = (page, values) => page.evaluate((v) => {
  const select = [...document.querySelectorAll('select')].find((el) => [...el.options].some((o) => o.value === 'foreground.json'));
  select.value = v;
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
}, values);
const waitForLabelsets = (page) => page.waitForFunction(() => [...document.querySelectorAll('select option')].some((o) => o.value === 'cerebellum.json'), { timeout: U.longTimeout });
const used = {
  annotated: 2,
  used: [1, 3, 12],
  unlabelled: [3, 12],
  labelset: { name: 'Foreground', count: 1, max: 1 }
};
const serverError = { status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) };

describe('TESTING THE PROJECT SETTINGS PAGE SCRIPT (project-settings-page.js)', function () {
  let browser;
  let opened;

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    await U.removeProject(SHORTNAME);
    const res = await U.insertProject(project());
    assert.isTrue(res.body.success, JSON.stringify(res.body));
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
    await U.removeProject(SHORTNAME);
  });

  it('loads all the files, and saves the complete list', async function () {
    opened = await openSettingsPage(browser);
    const { page } = opened;
    await page.waitForFunction((n) => {
      const el = document.querySelector('#numFiles');

      return el && Number(el.textContent) === n;
    }, { timeout: U.longTimeout }, NFILES);
    await clickButton(page, 'Save Changes');
    await page.waitForFunction(() => document.body.textContent.includes('Project settings updated.'), { timeout: U.mediumTimeout });
    assert.strictEqual(opened.saved.length, 1);
    assert.deepEqual(opened.saved[0].files.list.map((f) => f.source), FILES.map((f) => f.source));
    assert.deepEqual(opened.pageErrors, []);
  }).timeout(U.longTimeout);

  it('asks only for the names of the files, 100 at a time', async function () {
    opened = await openSettingsPage(browser);
    await waitForAllFiles(opened.page);
    const queries = opened.filesRequests.map((url) => Object.fromEntries(new URL(url).searchParams));
    assert.deepEqual(queries, [0, 100, 200].map((start) => ({ start: String(start), length: '100', names: 'true' })));
  }).timeout(U.longTimeout);

  it('tells the server how many files it received', async function () {
    opened = await openSettingsPage(browser);
    const { page } = opened;
    await waitForAllFiles(page);
    await clickButton(page, 'Save Changes');
    await page.waitForFunction(() => document.body.textContent.includes('Project settings updated.'), { timeout: U.mediumTimeout });
    assert.deepEqual(opened.saved[0].filesLoaded, { count: NFILES });
  }).timeout(U.longTimeout);

  // eslint-disable-next-line max-statements
  it('shows the settings right away, the files as they arrive, and the progress in the Files heading', async function () {
    opened = await openSettingsPage(browser, (req) => (startOf(req.url()) === 200 ? 'hold' : null));
    const { page } = opened;
    await page.waitForFunction(() => document.body.textContent.includes('200 / 250'), { timeout: U.longTimeout });
    assert.strictEqual(await numFiles(page), 200, 'the files received so far are shown');
    assert.strictEqual(await filesHeading(page), 'Files (loading… 200 / 250)');
    assert.isTrue(await filesLocked(page), 'the files cannot be edited while they load');
    assert.include(await page.evaluate(() => document.body.textContent), 'Collaborators', 'the other settings are shown');
    opened.held.forEach((req) => req.continue());
    await waitForAllFiles(page);
    assert.strictEqual(await filesHeading(page), 'Files');
    assert.isFalse(await filesLocked(page));
    assert.deepEqual(opened.pageErrors, []);
  }).timeout(U.longTimeout);

  it('tells the server when it saves before all the files have arrived', async function () {
    opened = await openSettingsPage(browser, (req) => (startOf(req.url()) === 200 ? 'hold' : null));
    const { page } = opened;
    await page.waitForFunction(() => document.body.textContent.includes('200 / 250'), { timeout: U.longTimeout });
    await clickButton(page, 'Save Changes');
    await page.waitForFunction(() => document.body.textContent.includes('Project settings updated.'), { timeout: U.mediumTimeout });
    assert.deepEqual(opened.saved[0].filesLoaded, { count: 200 });
    opened.held.forEach((req) => req.continue());
  }).timeout(U.longTimeout);

  it('retries a batch that failed', async function () {
    let failures = 0;
    opened = await openSettingsPage(browser, (req) => {
      if (startOf(req.url()) === 100 && failures < 1) {
        failures += 1;

        return serverError;
      }

      return null;
    });
    await waitForAllFiles(opened.page);
    assert.deepEqual(opened.filesRequests.map((url) => startOf(url)), [0, 100, 100, 200]);
  }).timeout(U.longTimeout);

  it('shows an error and a Retry button when a batch keeps failing, and resumes from there', async function () {
    let failing = true;
    opened = await openSettingsPage(browser, (req) => (failing && startOf(req.url()) === 200 ? serverError : null));
    const { page } = opened;
    await page.waitForFunction(() => [...document.querySelectorAll('h2 button')].some((b) => b.textContent.trim() === 'Retry'), { timeout: U.longTimeout });
    assert.match(await filesHeading(page), /^Files \(could not load all the files: .*\) Retry$/);
    assert.strictEqual(await numFiles(page), 200);
    failing = false;
    await clickButton(page, 'Retry');
    await waitForAllFiles(page);
    assert.strictEqual(await filesHeading(page), 'Files');
    assert.deepEqual(opened.filesRequests.filter((url) => startOf(url) < 200).map((url) => startOf(url)), [0, 100], 'the first batches are not asked again');
    assert.deepEqual(opened.pageErrors, []);
  }).timeout(U.longTimeout);

  it('lets the user click the empty URL cell of a file added with "+"', async function () {
    opened = await openSettingsPage(browser);
    const { page } = opened;
    await waitForAllFiles(page);
    await page.click('button[title="Add file"]');
    await page.waitForFunction(() => [...document.querySelectorAll('#files span[contenteditable]')].some((el) => el.textContent === ''), { timeout: U.mediumTimeout });
    const cell = await page.evaluate(() => {
      const el = [...document.querySelectorAll('#files span[contenteditable]')].find((s) => s.textContent === '');
      el.id = 'newFileURL';
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      const x = r.left + (r.width / 2);
      const y = r.top + (r.height / 2);

      return { width: r.width, height: r.height, x, y, hit: document.elementFromPoint(x, y) === el, placeholder: getComputedStyle(el, '::before').content };
    });
    assert.isAbove(cell.width, 20, 'the empty URL cell has a width');
    assert.isAbove(cell.height, 10, 'the empty URL cell has a height');
    assert.isTrue(cell.hit, 'the empty URL cell is what is under the pointer at its centre');
    assert.strictEqual(cell.placeholder, '"File URL"');
    await page.mouse.click(cell.x, cell.y);
    assert.isTrue(await page.evaluate(() => document.activeElement && document.activeElement.id === 'newFileURL'), 'clicking the cell focuses it');
    assert.deepEqual(opened.pageErrors, []);
  }).timeout(U.longTimeout);

  describe('changing the label set of a volume layer', function () {
    let dialogs;
    const answerDialogs = (page, accept) => {
      dialogs = [];
      page.on('dialog', async (dialog) => {
        dialogs.push(dialog.message());
        await (accept ? dialog.accept() : dialog.dismiss());
      });
    };
    const saveAndWait = async (page) => {
      await clickButton(page, 'Save Changes');
      await page.waitForFunction(() => document.body.textContent.includes('Project settings updated.'), { timeout: U.mediumTimeout });
    };

    it('does not check anything when no label set changed', async function () {
      opened = await openSettingsPage(browser);
      const { page } = opened;
      answerDialogs(page, true);
      await waitForAllFiles(page);
      await saveAndWait(page);
      assert.deepEqual(opened.checks, []);
      assert.deepEqual(dialogs, []);
      assert.strictEqual(opened.saved.length, 1);
    }).timeout(U.longTimeout);

    it('saves without asking when the new label set has a label for every value used', async function () {
      opened = await openSettingsPage(browser);
      const { page } = opened;
      answerDialogs(page, false);
      await waitForAllFiles(page);
      await waitForLabelsets(page);
      await chooseLabelset(page, 'cerebellum.json');
      await saveAndWait(page);
      assert.deepEqual(opened.checks, [{ layer: 'Vol', values: 'cerebellum.json' }]);
      assert.deepEqual(dialogs, []);
      assert.strictEqual(opened.saved.length, 1);
      assert.strictEqual(opened.saved[0].annotations.list[0].values, 'cerebellum.json');
    }).timeout(U.longTimeout);

    it('asks first when some values used have no label in the new label set, and does not save if the user declines', async function () {
      opened = await openSettingsPage(browser, () => null, (layer, values) => ({ ...used, values }));
      const { page } = opened;
      answerDialogs(page, false);
      await waitForAllFiles(page);
      await waitForLabelsets(page);
      await chooseLabelset(page, 'cerebrum.json');
      await clickButton(page, 'Save Changes');
      await U.delay(500);
      assert.lengthOf(dialogs, 1);
      assert.include(dialogs[0], 'Layer "Vol" already has annotations, in 2 MRIs, that use values up to 12.');
      assert.include(dialogs[0], 'the annotation values 3, 12 will no longer show as separate colours');
      assert.include(dialogs[0], 'Are you sure');
      assert.deepEqual(opened.saved, []);
      assert.deepEqual(opened.pageErrors, []);
    }).timeout(U.longTimeout);

    it('saves if the user confirms', async function () {
      opened = await openSettingsPage(browser, () => null, (layer, values) => ({ ...used, values }));
      const { page } = opened;
      answerDialogs(page, true);
      await waitForAllFiles(page);
      await waitForLabelsets(page);
      await chooseLabelset(page, 'cerebrum.json');
      await saveAndWait(page);
      assert.lengthOf(dialogs, 1);
      assert.strictEqual(opened.saved.length, 1);
      assert.strictEqual(opened.saved[0].annotations.list[0].values, 'cerebrum.json');
      // saved: the next save does not ask again
      await saveAndWait(page);
      assert.lengthOf(dialogs, 1);
      assert.lengthOf(opened.checks, 1);
    }).timeout(U.longTimeout);
  });
});
