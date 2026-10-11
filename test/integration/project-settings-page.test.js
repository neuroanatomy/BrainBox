'use strict';

/*
  Browser tests for the project settings page script (view/brainbox/src/pages/project-settings-page.js):
  the project's files are fetched in batches of 100, with a progress indicator, and the settings
  only appear once all of them have arrived, so that a partial list can never be saved. A batch
  that fails is retried, and then a Retry button lets the user resume. Saving is recorded instead
  of being carried out.
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
const isSaveRequest = (req) => req.method() === 'POST' && req.url().endsWith(`/project/json/${SHORTNAME}`);
const startOf = (url) => Number(new URL(url).searchParams.get('start'));

/**
 * Open the settings page. `respond(req)` may answer a request for a batch of files itself,
 * return 'hold' to keep it waiting (it is then added to `held`), or nothing to let it through.
 * Saving is answered with a canned success, and its payload recorded in `saved`.
 * @param {Object} browser A puppeteer browser
 * @param {Function} respond Optional handler for the requests for files
 * @returns {Object} The page, its errors, and the requests for files, held and saved
 */
const openSettingsPage = async (browser, respond = () => null) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  const pageErrors = [];
  const filesRequests = [];
  const held = [];
  const saved = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (!U.isLocalURL(url)) { req.abort(); } else if (isSaveRequest(req)) {
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

  return { page, pageErrors, filesRequests, held, saved };
};

const numFiles = (page) => page.$eval('#numFiles', (el) => Number(el.textContent));
const waitForSettings = (page) => page.waitForSelector('#numFiles', { timeout: U.longTimeout });
const clickButton = (page, text) => page.evaluate((t) => {
  const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
  button.click();
}, text);
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
    await waitForSettings(opened.page);
    const queries = opened.filesRequests.map((url) => Object.fromEntries(new URL(url).searchParams));
    assert.deepEqual(queries, [0, 100, 200].map((start) => ({ start: String(start), length: '100', names: 'true' })));
  }).timeout(U.longTimeout);

  it('tells the server how many files it received', async function () {
    opened = await openSettingsPage(browser);
    const { page } = opened;
    await waitForSettings(page);
    await clickButton(page, 'Save Changes');
    await page.waitForFunction(() => document.body.textContent.includes('Project settings updated.'), { timeout: U.mediumTimeout });
    assert.strictEqual(opened.saved[0].filesLoaded, NFILES);
  }).timeout(U.longTimeout);

  it('shows the loading progress, and the settings only once all the files have arrived', async function () {
    opened = await openSettingsPage(browser, (req) => (startOf(req.url()) === 200 ? 'hold' : null));
    const { page } = opened;
    await page.waitForFunction(() => document.body.textContent.includes('200 / 250'), { timeout: U.longTimeout });
    assert.isNull(await page.$('#numFiles'), 'no settings while files are loading');
    assert.deepEqual(await page.$eval('progress', (el) => [el.value, el.max]), [200, NFILES]);
    opened.held.forEach((req) => req.continue());
    await waitForSettings(page);
    assert.strictEqual(await numFiles(page), NFILES);
    assert.isNull(await page.$('progress'), 'the progress bar is gone');
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
    await waitForSettings(opened.page);
    assert.strictEqual(await numFiles(opened.page), NFILES);
    assert.deepEqual(opened.filesRequests.map((url) => startOf(url)), [0, 100, 100, 200]);
  }).timeout(U.longTimeout);

  it('shows an error and a Retry button when a batch keeps failing, and resumes from there', async function () {
    let failing = true;
    opened = await openSettingsPage(browser, (req) => (failing && startOf(req.url()) === 200 ? serverError : null));
    const { page } = opened;
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Retry'), { timeout: U.longTimeout });
    assert.include(await page.evaluate(() => document.body.textContent), '200 / 250');
    assert.isNull(await page.$('#numFiles'), 'no settings with an incomplete list of files');
    failing = false;
    await clickButton(page, 'Retry');
    await waitForSettings(page);
    assert.strictEqual(await numFiles(page), NFILES);
    assert.deepEqual(opened.filesRequests.filter((url) => startOf(url) < 200).map((url) => startOf(url)), [0, 100], 'the first batches are not asked again');
    assert.deepEqual(opened.pageErrors, []);
  }).timeout(U.longTimeout);
});
