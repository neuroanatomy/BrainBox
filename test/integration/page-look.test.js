/* eslint-disable max-lines */
'use strict';

/*
  The look of nwl-components (3.0.0; the 2027 theme of UI kit steps 12-13, now its default):
  every page links /lib/nwl-components/fonts.css, and Source Sans 3 loads. The nwl Vue pages
  (project settings, user, new project, admin and ask-for-login, step 13a) and the Mustache
  pages home, error and embedError (step 13b, their content in a .app) are in it; the home
  page's heading stays centred, and embedError, shown in a frame on other sites, loads its fonts
  from BrainBox. So are the viewers (project, MRI, embed and render3D, step 13c), whose font is
  checked on the viewer (#atlasmaker; on render3D, its body); the embed, and render3D in the
  embed's frame, load their fonts from BrainBox inside a frame on another site. nwl-components
  sets the font on the wrapper (.app), not on the body: that is the element checked on the
  other pages. Since 3.0.0 no page needs the data-nwl-theme attribute (UI kit step 14).
*/

const fs = require('fs').promises;
const { join } = require('path');

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

const TEMPLATES = join(__dirname, '../../templates');
const TEXT = '14px "Source Sans 3"';
const FONTS_CSS = '/lib/nwl-components/fonts.css';
const viewerURL = (route) => `${U.serverURL}${route}?url=${encodeURIComponent(U.localBertURL)}`;

/**
 * The URL of a page's fonts.css sheet, and once its fonts are ready, the font family of an element
 * (its .app by default), whether Source Sans 3 is available and whether one of its faces was loaded
 * @param {Object} browser A puppeteer browser
 * @param {string} url The page's URL
 * @param {Array} cookies The cookies to send (none: logged out)
 * @param {string} selector An element the page must have (default: nwl-components' wrapper)
 * @param {string} checked The font given to document.fonts.check (default: the body text's)
 * @param {string} fontOf The element whose font family is returned (default: .app)
 * @returns {Promise<Object>} The sheet's URL, the font family and the two checks
 */
const lookOf = async (browser, url, cookies = [], selector = '.app', checked = '14px "Source Sans 3"', fontOf = '.app') => {
  // a context of its own, so that a logged-out page gets no cookie from an earlier one
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  try {
    if (cookies.length) { await page.setCookie(...cookies); }
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector(selector);

    return await page.evaluate(async (font, el, href) => {
      await document.fonts.ready;
      const sheet = [...document.styleSheets].find((s) => s.href && s.href.endsWith(href));

      return {
        sheet: sheet ? sheet.href : null,
        font: getComputedStyle(document.querySelector(el)).fontFamily,
        check: document.fonts.check(font),
        loaded: [...document.fonts].some((f) => f.family.replace(/"/gu, '') === 'Source Sans 3' && f.status === 'loaded')
      };
    }, checked, fontOf, FONTS_CSS);
  } finally {
    await context.close();
  }
};

/**
 * Whether a page links fonts.css, once its HTML is parsed, and its HTTP status (the embed and
 * render3D viewers answer with the embedError page, which links it too, when they can't show
 * the brain)
 * @param {Object} browser A puppeteer browser
 * @param {string} url The page's URL
 * @returns {Promise<Object>} Whether the link is there, and the status
 */
const linkAndStatus = async (browser, url) => {
  const page = await browser.newPage();
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded' });

    return {
      status: res.status(),
      fontsCss: await page.evaluate((href) => Boolean(document.querySelector(`link[rel="stylesheet"][href="${href}"]`)), FONTS_CSS)
    };
  } finally {
    await page.close();
  }
};

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
 * The fonts.css sheet, the font family of an element and whether a Source Sans 3 face loaded,
 * in a frame, once the element is there and the fonts are ready
 * @param {Object} frame A puppeteer frame
 * @param {string} fontOf The element whose font family is returned
 * @returns {Promise<Object>} The frame's fonts
 */
const frameLook = async (frame, fontOf) => {
  await frame.waitForSelector(fontOf);

  return frame.evaluate(async (el, href) => {
    await document.fonts.ready;
    const sheet = [...document.styleSheets].find((s) => s.href && s.href.endsWith(href));

    return {
      sheet: sheet ? sheet.href : null,
      font: getComputedStyle(document.querySelector(el)).fontFamily,
      loaded: [...document.fonts].some((f) => f.family.replace(/"/gu, '') === 'Source Sans 3' && f.status === 'loaded')
    };
  }, fontOf, FONTS_CSS);
};

/**
 * A BrainBox page in a frame of a page of another origin (localhost <-> 127.0.0.1), as a site
 * embedding it: the host's origin, and in the frame, the fonts.css sheet,
 * the font family of an element (.app by default) and whether a Source Sans 3 face loaded.
 * With `inside`, the same for the frame's own frame whose URL has that path, once it is there
 * @param {Object} browser A puppeteer browser
 * @param {string} url The framed page's URL
 * @param {string} fontOf The element whose font family is returned
 * @param {Object} [inside] The inner frame: `path`, its URL's path, `fontOf`, and `open`, a
 *   function run in the outer frame that makes it
 * @returns {Promise<Object>} The host's origin, the frame's fonts, and the inner frame's
 */
const lookInFrame = async (browser, url, fontOf = '.app', inside = null) => {
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
    const res = await frameLook(frame, fontOf);
    if (!inside) { return { host, ...res }; }
    await frame.waitForFunction(inside.open, { timeout: U.longTimeout });
    const inner = await (await frame.waitForSelector(`iframe[src*="${inside.path}"]`)).contentFrame();

    return { host, ...res, inner: await frameLook(inner, inside.fontOf) };
  } finally {
    await context.close();
  }
};

/**
 * The visible form controls of a page whose font family differs from their parent's, once the
 * viewer and its annotations tables are there (logged in: the tables have their selects)
 * @param {Object} browser A puppeteer browser
 * @param {string} url The page's URL
 * @param {Array} cookies The cookies to send
 * @param {string} selector An element the page must have before the check
 * @returns {Promise<Object>} The number of visible controls, and those in another font
 */
const controlFonts = async (browser, url, cookies, selector) => {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  try {
    await page.setCookie(...cookies);
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector(selector, { timeout: U.longTimeout });

    return await page.evaluate(() => {
      const controls = [...document.querySelectorAll('button, input, select, textarea')]
        .filter((el) => el.getClientRects().length > 0);
      const other = controls
        .filter((el) => getComputedStyle(el).fontFamily !== getComputedStyle(el.parentElement).fontFamily)
        .map((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}: ${getComputedStyle(el).fontFamily}`);

      return { count: controls.length, other };
    });
  } finally {
    await context.close();
  }
};

/**
 * Check that a page links fonts.css and that its .app is in Source Sans 3, loaded
 * @param {Object} browser A puppeteer browser
 * @param {string} path The page's path
 * @param {Array} cookiesToSend The cookies to send (none: logged out)
 * @param {string} selector An element the page must have
 * @param {string} checked The font given to document.fonts.check
 * @param {string} fontOf The element whose font must be Source Sans 3 (default: .app)
 * @returns {Promise<void>} Resolves when the checks pass
 */
const assertLook = async (browser, path, cookiesToSend, selector, checked, fontOf) => {
  const res = await lookOf(browser, U.serverURL + path, cookiesToSend, selector, checked, fontOf);
  assert.equal(res.sheet, server.origin + FONTS_CSS);
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

describe('The look of every page (fonts.css, Source Sans 3)', function () {
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

    it('the project settings page links fonts.css and is in Source Sans 3', async function () {
      await assertLook(browser, `/project/${U.projectTest.shortname}/settings`, cookies);
    }).timeout(U.longTimeout);

    it('the user page links fonts.css and is in Source Sans 3', async function () {
      await assertLook(browser, '/user/foo', cookies);
    }).timeout(U.longTimeout);

    it('the new project page links fonts.css and is in Source Sans 3', async function () {
      await assertLook(browser, '/project/new', cookies);
    }).timeout(U.longTimeout);

    it('the admin page links fonts.css and is in Source Sans 3', async function () {
      await assertLook(browser, '/admin', cookies);
    }).timeout(U.longTimeout);

    it('the ask-for-login page links fonts.css and is in Source Sans 3', async function () {
      await assertLook(browser, '/project/new', [], '.ask-for-login');
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

    it('the home page links fonts.css and is in Source Sans 3', async function () {
      await assertLook(browser, '/', []);
    }).timeout(U.longTimeout);

    it('the home page links fonts.css and is in Source Sans 3 logged in too', async function () {
      await assertLook(browser, '/', cookies);
    }).timeout(U.longTimeout);

    it('the home page\'s heading stays centred', async function () {
      const heading = await headingOf(browser, `${U.serverURL}/`);
      assert.equal(heading.align, 'center');
      assert.equal(heading.left, heading.right, 'the heading spans the content column');
    }).timeout(U.longTimeout);

    it('the error page links fonts.css and is in Source Sans 3', async function () {
      // the page has only its heading, in the semibold face: the regular one isn't loaded
      await assertLook(browser, '/api/getAtlasBackups', [], '.app', '600 14px "Source Sans 3"');
    }).timeout(U.longTimeout);

    it('the embedError page links fonts.css and is in Source Sans 3', async function () {
      await assertLook(browser, missingEmbed, []);
    }).timeout(U.longTimeout);

    it('the embedError page loads its fonts from BrainBox inside a frame on another site', async function () {
      const res = await lookInFrame(browser, U.serverURL + missingEmbed);
      assert.notEqual(res.host, server.origin, 'the host page is of another origin');
      assert.equal(res.sheet, `${server.origin}/lib/nwl-components/fonts.css`);
      assert.match(res.font, /^"Source Sans 3",/u);
      assert.isTrue(res.loaded, 'a Source Sans 3 face is loaded in the frame');
    }).timeout(U.longTimeout);
  });

  describe('the viewers project, MRI, embed and render3D (step 13c)', function () {
    let browser;
    let cookies;
    let previousAdmins;

    before(async function () {
      // eslint-disable-next-line no-invalid-this
      this.timeout(U.longTimeout);
      ({ browser, cookies, previousAdmins } = await setUp());
      await U.waitForTestBrain();
    });

    after(async function () {
      admins.setAdmins(previousAdmins);
      if (browser) { await browser.close(); }
    });

    it('every page template links fonts.css', async function () {
      const templates = (await fs.readdir(TEMPLATES)).filter((f) => f.endsWith('.mustache'));
      assert.isAtLeast(templates.length, 12);
      const texts = await Promise.all(templates.map((f) => fs.readFile(join(TEMPLATES, f), 'utf8')));
      templates.forEach((file, i) => {
        assert.include(texts[i], '<link rel="stylesheet" href="/lib/nwl-components/fonts.css">', file);
      });
    });

    it('the MRI page links fonts.css, its viewer in Source Sans 3', async function () {
      await assertLook(browser, `/mri?url=${U.localBertURL}`, [], '#atlasmaker', TEXT, '#atlasmaker');
    }).timeout(U.longTimeout);

    it('the MRI page links fonts.css and is in Source Sans 3 logged in too', async function () {
      await assertLook(browser, `/mri?url=${U.localBertURL}`, cookies, '#atlasmaker', TEXT, '#atlasmaker');
    }).timeout(U.longTimeout);

    it('the project page links fonts.css, its viewer in Source Sans 3', async function () {
      await assertLook(browser, `/project/${U.projectTest.shortname}`, [], '#atlasmaker', TEXT, '#atlasmaker');
    }).timeout(U.longTimeout);

    it('the project page links fonts.css and is in Source Sans 3 logged in too', async function () {
      await assertLook(browser, `/project/${U.projectTest.shortname}`, cookies, '#atlasmaker', TEXT, '#atlasmaker');
    }).timeout(U.longTimeout);

    it('the MRI and project pages\' form controls are in the font of the text around them', async function () {
      for (const [path, selector] of [
        [`/mri?url=${U.localBertURL}`, '#annotations tbody tr select'],
        [`/project/${U.projectTest.shortname}`, '#projectFiles tbody tr']
      ]) {
        // eslint-disable-next-line no-await-in-loop
        const res = await controlFonts(browser, U.serverURL + path, cookies, selector);
        assert.isAbove(res.count, 10, path);
        assert.deepEqual(res.other, [], path);
      }
    }).timeout(U.longTimeout);

    it('the embed viewer links fonts.css and is in Source Sans 3', async function () {
      const res = await linkAndStatus(browser, viewerURL('/mri/embed'));
      assert.deepEqual(res, { status: 200, fontsCss: true });
      await assertLook(browser, `/mri/embed?url=${encodeURIComponent(U.localBertURL)}`, [], '#atlasmaker', TEXT, '#atlasmaker');
    }).timeout(U.longTimeout);

    it('the render3D viewer links fonts.css and is in Source Sans 3', async function () {
      const res = await linkAndStatus(browser, viewerURL('/mri/render3d'));
      assert.deepEqual(res, { status: 200, fontsCss: true });
      // render3D replaces the body's content: its splash's text is in the body's font
      await assertLook(browser, `/mri/render3d?url=${encodeURIComponent(U.localBertURL)}`, [], '#splash p', '16px "Source Sans 3"', 'body');
    }).timeout(U.longTimeout);

    it('the embed, and render3D in its frame, load their fonts from BrainBox inside a frame on another site', async function () {
      const res = await lookInFrame(browser, viewerURL('/mri/embed'), '#atlasmaker', {
        path: '/mri/render3d',
        fontOf: '#splash p',
        // choose 3D once the viewer is ready: render3D comes in a frame of the embed's
        open: () => {
          const widget = window.AtlasMakerWidget;
          if (!widget || !widget.isViewerReady()) { return false; }
          if (!document.getElementById('render3d-frame')) { document.querySelector('#plane button[title="3d"]').click(); }

          return Boolean(document.getElementById('render3d-frame'));
        }
      });
      assert.notEqual(res.host, server.origin, 'the host page is of another origin');
      for (const frame of [res, res.inner]) {
        assert.equal(frame.sheet, `${server.origin}/lib/nwl-components/fonts.css`);
        assert.match(frame.font, /^"Source Sans 3",/u);
        assert.isTrue(frame.loaded, 'a Source Sans 3 face is loaded in the frame');
      }
    }).timeout(U.longTimeout);
  });
});
