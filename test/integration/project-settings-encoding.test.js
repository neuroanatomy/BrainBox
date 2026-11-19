'use strict';

/*
  Browser test for the project settings page script (view/brainbox/src/pages/project-settings-page.js):
  the shortname is encoded in the URLs of the requests for the files (nwl-components'
  useBatchedFiles) and of the label set checks. The server only accepts shortnames that need no
  encoding, so the page of a test project is served with another shortname in its project, and
  the requests that use it are answered by the test.
*/

const chai = require('chai');
const { assert } = chai;
const U = require('../utils.js');

const SHORTNAME = 'settingsencodingtest';
// What the page's script is given as the project's shortname
const SHOWN = 'settings encoding/test';
const ENCODED = 'settings%20encoding%2Ftest';
const FILES = Array.from({ length: 3 }, (_, i) => ({ source: `https://example.org/settingsencodingtest/${i}.nii.gz`, name: '' }));
const project = () => ({
  name: 'Settings encoding test',
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
  description: 'A project for testing the encoding of the shortname on the project settings page.',
  modified: (new Date()).toJSON(),
  modifiedBy: 'foo'
});

const PAGE = `${U.serverURL}/project/${SHORTNAME}/settings`;
const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

/**
 * Open the settings page, served as `html`, answering the requests for the files, the label set
 * checks and the save, and recording the paths of the first two
 * @param {Object} browser A puppeteer browser
 * @param {string} html The page
 * @returns {Object} The page, its errors and the paths requested
 */
const openPage = async (browser, html) => {
  const page = await browser.newPage();
  const pageErrors = [];
  const paths = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    const { pathname, searchParams } = new URL(url);
    if (!U.isLocalURL(url)) {
      req.abort();
    } else if (url === PAGE) {
      req.respond({ status: 200, contentType: 'text/html', body: html });
    } else if (pathname.endsWith('/files') || pathname.endsWith('/labelset-check')) {
      paths.push(pathname);
      req.respond(pathname.endsWith('/files') ? json(FILES) : json({ layer: searchParams.get('layer'), values: searchParams.get('values'), unlabelled: [] }));
    } else if (req.method() === 'POST' && pathname.startsWith('/project/json/')) {
      req.respond(json({ success: true, message: 'Project settings updated.' }));
    } else {
      req.continue();
    }
  });
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });

  return { page, pageErrors, paths };
};

describe('TESTING THE SHORTNAME ENCODING OF THE PROJECT SETTINGS PAGE SCRIPT (project-settings-page.js)', function () {
  let browser;
  let page;

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    await U.removeProject(SHORTNAME);
    const res = await U.insertProject(project());
    assert.isTrue(res.body.success, JSON.stringify(res.body));
    browser = await U.launchBrowser({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  });

  after(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    if (page) { await page.close(); }
    if (browser) { await browser.close(); }
    await U.removeProject(SHORTNAME);
  });

  it('encodes the shortname in the requests for the files and in the label set checks', async function () {
    // the page as the server sends it, with the other shortname in its project
    const html = (await (await fetch(PAGE)).text()).replace(`"shortname":"${SHORTNAME}"`, `"shortname":"${SHOWN}"`);
    assert.include(html, `"shortname":"${SHOWN}"`);

    let pageErrors;
    let paths;
    ({ page, pageErrors, paths } = await openPage(browser, html));

    // all the files in, then a label set change, which is checked when saving
    await page.waitForFunction((n) => {
      const el = document.querySelector('#numFiles');

      return el && Number(el.textContent) === n;
    }, { timeout: U.longTimeout }, FILES.length);
    await page.waitForFunction(() => [...document.querySelectorAll('select option')].some((o) => o.value === 'cerebellum.json'), { timeout: U.longTimeout });
    await page.evaluate(() => {
      const select = [...document.querySelectorAll('select')].find((el) => [...el.options].some((o) => o.value === 'foreground.json'));
      select.value = 'cerebellum.json';
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Save Changes').click());
    await page.waitForFunction(() => document.body.textContent.includes('Project settings updated.'), { timeout: U.mediumTimeout });

    assert.deepEqual(paths, [`/project/json/${ENCODED}/files`, `/project/json/${ENCODED}/labelset-check`]);
    assert.deepEqual(pageErrors, []);
  }).timeout(U.longTimeout);
});
