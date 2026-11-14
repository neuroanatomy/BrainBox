'use strict';

/*
  UI kit step 13a: the nwl Vue pages (project settings, user, new project, admin and
  ask-for-login) opt in to nwl-components' 2027 theme, with `<html data-nwl-theme="2027">` and
  a link to /lib/nwl-components/fonts.css. Step 13b: so do the Mustache pages home, error and
  embedError, whose content is put in a .app for it; the home page's heading stays centred, and
  embedError, shown in a frame on other sites, loads its fonts from BrainBox. The viewers (project,
  MRI, embed, render3D) don't, yet.
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

// a brain that doesn't exist: the embed answers with the embedError page
const missingEmbed = `/mri/embed?url=${encodeURIComponent('https://example.com/no-such-brain-for-the-theme.nii.gz')}`;
const server = new URL(U.serverURL);
const otherOrigin = `${server.protocol}//${server.hostname === 'localhost' ? '127.0.0.1' : 'localhost'}${server.port ? ':' + server.port : ''}`;

/**
 * The theme attribute of a page, and once its fonts are ready, the font family of its .app,
 * whether Source Sans 3 is available and whether one of its faces was loaded
 * @param {Object} browser A puppeteer browser
 * @param {string} url The page's URL
 * @param {Array} cookies The cookies to send (none: logged out)
 * @param {string} selector An element the page must have (default: nwl-components' wrapper)
 * @param {string} checked The font given to document.fonts.check (default: the body text's)
 * @returns {Promise<Object>} The attribute, the font family and the two checks
 */
const themeOf = async (browser, url, cookies = [], selector = '.app', checked = '14px "Source Sans 3"') => {
  // a context of its own, so that a logged-out page gets no cookie from an earlier one
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  try {
    if (cookies.length) { await page.setCookie(...cookies); }
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector(selector);

    return await page.evaluate(async (font) => {
      await document.fonts.ready;

      return {
        theme: document.documentElement.getAttribute('data-nwl-theme'),
        font: getComputedStyle(document.querySelector('.app')).fontFamily,
        check: document.fonts.check(font),
        loaded: [...document.fonts].some((f) => f.family.replace(/"/gu, '') === 'Source Sans 3' && f.status === 'loaded')
      };
    }, checked);
  } finally {
    await context.close();
  }
};

/**
 * The theme attribute of a page, once its HTML is parsed, and its HTTP status (the embed and
 * render3D viewers answer with the opted-in embedError page when they can't show the brain)
 * @param {Object} browser A puppeteer browser
 * @param {string} url The page's URL
 * @returns {Promise<Object>} The attribute's value and the status
 */
const themeAndStatus = async (browser, url) => {
  const page = await browser.newPage();
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded' });

    return {
      status: res.status(),
      theme: await page.evaluate(() => document.documentElement.getAttribute('data-nwl-theme'))
    };
  } finally {
    await page.close();
  }
};

/**
 * The theme attribute of a page, once its HTML is parsed
 * @param {Object} browser A puppeteer browser
 * @param {string} url The page's URL
 * @returns {Promise<string|null>} The attribute's value
 */
const themeAttribute = async (browser, url) => (await themeAndStatus(browser, url)).theme;

/**
 * The alignment of the home page's heading, and its space left and right in the content column
 * @param {Object} browser A puppeteer browser
 * @param {string} url The page's URL
 * @returns {Promise<Object>} The heading's text-align and the two spaces
 */
const headingOf = async (browser, url) => {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'load' });

    return await page.evaluate(() => {
      const h2 = document.querySelector('.content h2');
      const box = h2.getBoundingClientRect();
      const content = h2.parentElement.getBoundingClientRect();

      return { align: getComputedStyle(h2).textAlign, left: box.left - content.left, right: content.right - box.right };
    });
  } finally {
    await page.close();
  }
};

/**
 * A BrainBox page in a frame of a page of another origin (localhost <-> 127.0.0.1), as a site
 * embedding it: the host's origin, and in the frame, the theme attribute, the fonts.css sheet,
 * the font family of .app and whether a Source Sans 3 face loaded
 * @param {Object} browser A puppeteer browser
 * @param {string} url The framed page's URL
 * @returns {Promise<Object>} The host's origin and the frame's theme and fonts
 */
const themeInFrame = async (browser, url) => {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  try {
    await page.goto(`${otherOrigin}/test_data/foo.png`, { waitUntil: 'load' });
    const host = await page.evaluate((src) => new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.onload = () => resolve(location.origin);
      iframe.onerror = reject;
      iframe.src = src;
      document.body.appendChild(iframe);
    }), url);
    const frame = page.frames().find((f) => f.url().startsWith(server.origin));
    const res = await frame.evaluate(async () => {
      await document.fonts.ready;
      const sheet = [...document.styleSheets].find((s) => s.href && s.href.endsWith('/lib/nwl-components/fonts.css'));

      return {
        theme: document.documentElement.getAttribute('data-nwl-theme'),
        sheet: sheet ? sheet.href : null,
        font: getComputedStyle(document.querySelector('.app')).fontFamily,
        loaded: [...document.fonts].some((f) => f.family.replace(/"/gu, '') === 'Source Sans 3' && f.status === 'loaded')
      };
    });

    return { host, ...res };
  } finally {
    await context.close();
  }
};

/**
 * Check that a page opted in to the 2027 theme and that its .app is in Source Sans 3
 * @param {Object} browser A puppeteer browser
 * @param {string} path The page's path
 * @param {Array} cookiesToSend The cookies to send (none: logged out)
 * @param {string} selector An element the page must have
 * @param {string} checked The font given to document.fonts.check
 * @returns {Promise<void>} Resolves when the checks pass
 */
const assertOpted = async (browser, path, cookiesToSend, selector, checked) => {
  const res = await themeOf(browser, U.serverURL + path, cookiesToSend, selector, checked);
  assert.equal(res.theme, '2027');
  assert.match(res.font, /^"Source Sans 3",/u);
  assert.isTrue(res.check, 'document.fonts.check');
  assert.isTrue(res.loaded, 'a Source Sans 3 face is loaded');
};

/**
 * Sign up and log in the testing user, made an admin, and launch a browser
 * @returns {Promise<Object>} The browser, the session cookies and the previous admins
 */
const setUp = async () => {
  const agent = chai.request.agent(U.serverURL);
  await agent.post('/localSignup').send(U.testingCredentials);
  const res = await agent.post('/localLogin').redirects(0)
    .send(U.testingCredentials);
  expect(res).to.have.cookie('connect.sid');
  const previousAdmins = admins.getAdmins();
  admins.setAdmins([U.testingCredentials.username]);
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  return { browser, cookies: U.parseCookies(res.headers['set-cookie'][0]), previousAdmins };
};

describe('Pages in the 2027 theme', function () {
  describe('the nwl Vue pages (step 13a)', function () {
    let browser;
    let cookies;
    let previousAdmins;

    before(async function () {
      // eslint-disable-next-line no-invalid-this
      this.timeout(U.longTimeout);
      ({ browser, cookies, previousAdmins } = await setUp());
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

    it('the project settings page is in the 2027 theme, in Source Sans 3', async function () {
      await assertOpted(browser, `/project/${U.projectTest.shortname}/settings`, cookies);
    }).timeout(U.longTimeout);

    it('the user page is in the 2027 theme, in Source Sans 3', async function () {
      await assertOpted(browser, '/user/foo', cookies);
    }).timeout(U.longTimeout);

    it('the new project page is in the 2027 theme, in Source Sans 3', async function () {
      await assertOpted(browser, '/project/new', cookies);
    }).timeout(U.longTimeout);

    it('the admin page is in the 2027 theme, in Source Sans 3', async function () {
      await assertOpted(browser, '/admin', cookies);
    }).timeout(U.longTimeout);

    it('the ask-for-login page is in the 2027 theme, in Source Sans 3', async function () {
      await assertOpted(browser, '/project/new', [], '.ask-for-login');
    }).timeout(U.longTimeout);

    it('the project page is not in the 2027 theme', async function () {
      assert.isNull(await themeAttribute(browser, `${U.serverURL}/project/${U.projectTest.shortname}`));
    }).timeout(U.longTimeout);

    it('the MRI page is not in the 2027 theme', async function () {
      assert.isNull(await themeAttribute(browser, `${U.serverURL}/mri?url=${U.localBertURL}`));
    }).timeout(U.longTimeout);
  });

  describe('the Mustache pages home, error and embedError (step 13b)', function () {
    let browser;
    let cookies;
    let previousAdmins;

    before(async function () {
      // eslint-disable-next-line no-invalid-this
      this.timeout(U.longTimeout);
      ({ browser, cookies, previousAdmins } = await setUp());
      // the embed and render3D viewers need the test brain
      await U.waitForTestBrain();
    });

    after(async function () {
      admins.setAdmins(previousAdmins);
      if (browser) { await browser.close(); }
    });

    it('the home page is in the 2027 theme, in Source Sans 3', async function () {
      await assertOpted(browser, '/', []);
    }).timeout(U.longTimeout);

    it('the home page is in the 2027 theme logged in too', async function () {
      await assertOpted(browser, '/', cookies);
    }).timeout(U.longTimeout);

    it('the home page\'s heading stays centred', async function () {
      const heading = await headingOf(browser, `${U.serverURL}/`);
      assert.equal(heading.align, 'center');
      assert.equal(heading.left, heading.right, 'the heading spans the content column');
    }).timeout(U.longTimeout);

    it('the error page is in the 2027 theme, in Source Sans 3', async function () {
      // the page has only its heading, in the semibold face: the regular one isn't loaded
      await assertOpted(browser, '/api/getAtlasBackups', [], '.app', '600 14px "Source Sans 3"');
    }).timeout(U.longTimeout);

    it('the embedError page is in the 2027 theme, in Source Sans 3', async function () {
      await assertOpted(browser, missingEmbed, []);
    }).timeout(U.longTimeout);

    it('the embedError page loads its fonts from BrainBox inside a frame on another site', async function () {
      const res = await themeInFrame(browser, U.serverURL + missingEmbed);
      assert.notEqual(res.host, server.origin, 'the host page is of another origin');
      assert.equal(res.theme, '2027');
      assert.equal(res.sheet, `${server.origin}/lib/nwl-components/fonts.css`);
      assert.match(res.font, /^"Source Sans 3",/u);
      assert.isTrue(res.loaded, 'a Source Sans 3 face is loaded in the frame');
    }).timeout(U.longTimeout);

    it('the embed viewer is not in the 2027 theme', async function () {
      assert.deepEqual(await themeAndStatus(browser, `${U.serverURL}/mri/embed?url=${encodeURIComponent(U.localBertURL)}`), { status: 200, theme: null });
    }).timeout(U.longTimeout);

    it('the render3D viewer is not in the 2027 theme', async function () {
      assert.deepEqual(await themeAndStatus(browser, `${U.serverURL}/mri/render3d?url=${encodeURIComponent(U.localBertURL)}`), { status: 200, theme: null });
    }).timeout(U.longTimeout);
  });
});
