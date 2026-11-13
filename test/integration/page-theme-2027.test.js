'use strict';

/*
  UI kit step 13a: the nwl Vue pages (project settings, user, new project, admin and
  ask-for-login) opt in to nwl-components' 2027 theme, with `<html data-nwl-theme="2027">` and
  a link to /lib/nwl-components/fonts.css. The other pages (home, project, MRI) don't, yet.
  nwl-components sets the font on the wrapper (.app), not on the body: that is the element
  checked.
*/

const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert, expect } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');
const admins = require('../../controller/admin/admins');

/**
 * The theme attribute of a page, and once its fonts are ready, the font family of its .app,
 * whether Source Sans 3 is available and whether one of its faces was loaded
 * @param {Object} browser A puppeteer browser
 * @param {string} url The page's URL
 * @param {Array} cookies The cookies to send (none: logged out)
 * @param {string} selector An element the page must have (default: nwl-components' wrapper)
 * @returns {Promise<Object>} The attribute, the font family and the two checks
 */
const themeOf = async (browser, url, cookies = [], selector = '.app') => {
  // a context of its own, so that a logged-out page gets no cookie from an earlier one
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  try {
    if (cookies.length) { await page.setCookie(...cookies); }
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector(selector);

    return await page.evaluate(async () => {
      await document.fonts.ready;

      return {
        theme: document.documentElement.getAttribute('data-nwl-theme'),
        font: getComputedStyle(document.querySelector('.app')).fontFamily,
        check: document.fonts.check('14px "Source Sans 3"'),
        loaded: [...document.fonts].some((f) => f.family.replace(/"/gu, '') === 'Source Sans 3' && f.status === 'loaded')
      };
    });
  } finally {
    await context.close();
  }
};

/**
 * The theme attribute of a page, once its HTML is parsed
 * @param {Object} browser A puppeteer browser
 * @param {string} url The page's URL
 * @returns {Promise<string|null>} The attribute's value
 */
const themeAttribute = async (browser, url) => {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    return await page.evaluate(() => document.documentElement.getAttribute('data-nwl-theme'));
  } finally {
    await page.close();
  }
};

describe('The nwl Vue pages opt in to the 2027 theme', function () {
  let browser;
  let cookies;
  let previousAdmins;

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    const agent = chai.request.agent(U.serverURL);
    await agent.post('/localSignup').send(U.testingCredentials);
    const res = await agent.post('/localLogin').redirects(0)
      .send(U.testingCredentials);
    expect(res).to.have.cookie('connect.sid');
    cookies = U.parseCookies(res.headers['set-cookie'][0]);
    previousAdmins = admins.getAdmins();
    admins.setAdmins([U.testingCredentials.username]);
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  });

  after(async function () {
    admins.setAdmins(previousAdmins);
    if (browser) { await browser.close(); }
  });

  it('serves fonts.css and its fonts', async function () {
    const css = await chai.request(U.serverURL).get('/lib/nwl-components/fonts.css');
    assert.equal(css.status, 200);
    assert.match(css.headers['content-type'], /^text\/css/u);
    const [, file] = css.text.match(/url\("(fonts\/[^"]+\.woff2)"\)/u);
    const font = await chai.request(U.serverURL).get(`/lib/nwl-components/${file}`);
    assert.equal(font.status, 200);
  }).timeout(U.longTimeout);

  /**
   * Check that a page opted in to the 2027 theme and that its .app is in Source Sans 3
   * @param {string} path The page's path
   * @param {Array} cookiesToSend The cookies to send (none: logged out)
   * @param {string} selector An element the page must have
   * @returns {Promise<void>} Resolves when the checks pass
   */
  const assertOpted = async (path, cookiesToSend, selector) => {
    const res = await themeOf(browser, U.serverURL + path, cookiesToSend, selector);
    assert.equal(res.theme, '2027');
    assert.match(res.font, /^"Source Sans 3",/u);
    assert.isTrue(res.check, 'document.fonts.check');
    assert.isTrue(res.loaded, 'a Source Sans 3 face is loaded');
  };

  it('the project settings page is in the 2027 theme, in Source Sans 3', async function () {
    await assertOpted(`/project/${U.projectTest.shortname}/settings`, cookies);
  }).timeout(U.longTimeout);

  it('the user page is in the 2027 theme, in Source Sans 3', async function () {
    await assertOpted('/user/foo', cookies);
  }).timeout(U.longTimeout);

  it('the new project page is in the 2027 theme, in Source Sans 3', async function () {
    await assertOpted('/project/new', cookies);
  }).timeout(U.longTimeout);

  it('the admin page is in the 2027 theme, in Source Sans 3', async function () {
    await assertOpted('/admin', cookies);
  }).timeout(U.longTimeout);

  it('the ask-for-login page is in the 2027 theme, in Source Sans 3', async function () {
    await assertOpted('/project/new', [], '.ask-for-login');
  }).timeout(U.longTimeout);

  it('the home page is not in the 2027 theme', async function () {
    assert.isNull(await themeAttribute(browser, `${U.serverURL}/`));
  }).timeout(U.longTimeout);

  it('the project page is not in the 2027 theme', async function () {
    assert.isNull(await themeAttribute(browser, `${U.serverURL}/project/${U.projectTest.shortname}`));
  }).timeout(U.longTimeout);

  it('the MRI page is not in the 2027 theme', async function () {
    assert.isNull(await themeAttribute(browser, `${U.serverURL}/mri?url=${U.localBertURL}`));
  }).timeout(U.longTimeout);
});
