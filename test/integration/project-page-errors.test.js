/* global AtlasMakerWidget */
'use strict';

/*
  Browser tests for the project page script (view/brainbox/src/pages/project-page.js) when
  something cannot be loaded: the viewer shows an error, instead of "Loading brain…" forever,
  when the first file cannot be read, when the project has no files, and when the project's
  files cannot be fetched. A file that cannot be loaded does not stop the rest of the page
  from being set up.
*/

const crypto = require('crypto');
const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const U = require('../utils.js');

const SHORTNAME = 'projectpageerrortest';
const PAGE = `${U.serverURL}/project/${SHORTNAME}`;
// Downloads fine, but is not an MRI (test-only route, test/utils.js)
const UNREADABLE_URL = `${U.testDataURL}/test_data/unreadable_brain.mgz`;

const project = (files) => ({
  name: 'Project page error test',
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
  files: { list: files },
  annotations: {
    list: [{ type: 'volume', values: 'foreground.json', display: 'true', name: 'Vol A' }]
  },
  description: 'A project for testing the project page when a brain cannot be loaded.',
  modified: (new Date()).toJSON(),
  modifiedBy: 'foo'
});

/**
 * Open the project page, and wait until the viewer is no longer loading
 * @param {Object} browser A puppeteer browser
 * @param {Function} [respond] req => canned answer for a local request, or null
 * @returns {Promise<Object>} { page, pageErrors }
 */
const openPage = async (browser, respond = () => null) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (!U.isLocalURL(req.url())) {
      req.abort();

      return;
    }
    const answer = respond(req);
    if (answer) { req.respond(answer); } else { req.continue(); }
  });
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  // The server downloads a file, fails to read it, and says so at the next poll (2 s later)
  await page.waitForFunction(
    () => window.AtlasMakerWidget && document.getElementById('loadingIndicator') && AtlasMakerWidget.viewerState !== 'loading',
    { timeout: U.mediumTimeout }
  );

  return { page, pageErrors };
};

// What the viewer's loading indicator says
const loadingIndicator = (page) => page.evaluate(() => {
  const el = document.getElementById('loadingIndicator');

  return {
    shown: getComputedStyle(el).display !== 'none',
    error: el.classList.contains('error'),
    state: AtlasMakerWidget.viewerState,
    text: el.querySelector('p').textContent
  };
});

describe('TESTING THE PROJECT PAGE SCRIPT WHEN A BRAIN CANNOT BE LOADED (project-page.js)', function () {
  let browser;
  let opened;

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    browser = await puppeteer.launch({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  });

  afterEach(async function () {
    if (opened && opened.page) { await opened.page.close(); }
    opened = null;
    await U.removeProject(SHORTNAME);
  });

  after(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    if (browser) { await browser.close(); }
    // The failed download leaves its file in the server's data directory
    const hash = crypto.createHash('md5').update(UNREADABLE_URL)
      .digest('hex');
    await U.removeMRI({ dirPath: './public/data/' + hash, srcURL: UNREADABLE_URL });
  });

  it('shows why the first file cannot be loaded, and still sets up the rest of the page', async function () {
    await U.insertProject(project([{ source: UNREADABLE_URL, name: 'unreadable' }, { source: U.localBertURL, name: 'bert_brain' }]));
    opened = await openPage(browser);
    const { page, pageErrors } = opened;
    const indicator = await loadingIndicator(page);
    assert.deepInclude(indicator, { shown: true, error: true, state: 'error' });
    assert.match(indicator.text, /^This brain could not be loaded: ./, 'with the server\'s reason');
    await page.waitForFunction(() => document.querySelector('#tools > #tools-side'), { timeout: U.shortTimeout });
    assert.strictEqual(await page.$$eval('#projectFiles tbody tr', (rows) => rows.length), 2, 'every file is listed');
    assert.deepEqual(pageErrors, []);
  }).timeout(U.longTimeout);

  it('says so, instead of loading forever, when the project has no files', async function () {
    await U.insertProject(project([]));
    opened = await openPage(browser);
    assert.deepInclude(await loadingIndicator(opened.page), { shown: true, error: true, state: 'error', text: 'This project has no files.' });
    assert.deepEqual(opened.pageErrors, []);
  }).timeout(U.longTimeout);

  it('shows an error, instead of loading forever, when the project\'s files cannot be fetched', async function () {
    await U.insertProject(project([{ source: U.localBertURL, name: 'bert_brain' }]));
    opened = await openPage(browser, (req) => (req.url().includes(`/project/json/${SHORTNAME}/files`)
      ? { status: 500, contentType: 'application/json', body: '{"error":"boom"}' }
      : null));
    const indicator = await loadingIndicator(opened.page);
    assert.deepInclude(indicator, { shown: true, error: true, state: 'error' });
    assert.match(indicator.text, /^This project could not be loaded: ./);
  }).timeout(U.longTimeout);
});
