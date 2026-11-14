'use strict';

/*
  Headers and footers (UI kit steps 10 and 10b). The ask-for-login page uses nwl-components'
  Vue Header (with its Nav) and Footer, as the user and admin pages do, and its Log In link
  goes to GitHub. So do the MRI and project pages (step 10b): their Header (and the MRI
  page's Footer) are small Vue apps of their own, on #bb-header-app and #bb-footer-app,
  outside the viewer; they compute as on the user page, except the header's 3px padding
  above and below, left out so that the viewer stays where it was (76px from the top; the
  footer is in Source Sans 3, the kit's font since nwl-components 3.0.0). The
  project page has no footer; its header's title is the project's name, as text, and its
  settings link shows for every visitor (the settings page checks the access). No MRI is
  downloaded: the requests for MRI data are aborted.
*/

const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const U = require('../utils.js');
const F = require('../mri-access-fixtures.js');

// a logged-in user, for the header's Log Out
const VISITOR = 'header-visitor';

/**
 * Open a page logged out, with only our server's requests and no MRI data
 * @param {Object} browser A puppeteer browser
 * @param {string} path The page's path
 * @param {Array<Object>} [cookies] Cookies to set first (a session's)
 * @param {Array<string>} [errors] Receives the messages of the page's uncaught errors
 * @returns {Promise<Object>} The page
 */
const openPage = async (browser, path, cookies = [], errors = []) => {
  const page = await browser.newPage();
  page.on('pageerror', (err) => errors.push(err.message));
  if (cookies.length > 0) { await page.setCookie(...cookies); }
  await page.setViewport({ width: 1200, height: 900 });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (!U.isLocalURL(url) || (!req.isNavigationRequest() && (url.includes('/mri/json') || url.includes('.nii.gz')))) {
      req.abort();
    } else {
      req.continue();
    }
  });
  await page.goto(`${U.serverURL}${path}`, { waitUntil: 'load' });

  return page;
};

/**
 * What the MRI page's nwl-components header and footer show
 * @param {Object} page A puppeteer page
 * @returns {Promise<Object>} Title, Nav links, login links, footers, the hand-made header's elements
 */
const mriHeaderFooter = async (page) => {
  await page.waitForSelector('#bb-header-app > header nav#menu .login a');
  await page.waitForSelector('#bb-footer-app > footer');

  return page.evaluate(() => ({
    title: document.querySelector('#bb-header-app > header .title').textContent,
    navLinks: [...document.querySelectorAll('#bb-header-app > header nav#menu > a')].map((a) => a.getAttribute('href')),
    logIn: [...document.querySelectorAll('#bb-header-app > header nav#menu .login a')].map((a) => [a.textContent.trim(), a.getAttribute('href')]),
    footers: document.querySelectorAll('#bb-footer-app > footer').length,
    handMade: document.querySelectorAll('.bb-header, .bb-footer, #MyLogin, #addProject, .footerLinks').length
  }));
};

const MRI_NAV = ['/project/new', 'https://openneurolab.github.io/metasearch', 'https://github.com/neuroanatomy/BrainBox', 'https://github.com/neuroanatomy/BrainBox/issues/new', 'https://github.com/neuroanatomy/BrainBox'];
// the project page's: the same, plus the settings link
const projectNav = (shortname) => [MRI_NAV[0], `/project/${shortname}/settings`, ...MRI_NAV.slice(1)];

// a project whose name looks like markup, a Vue/Mustache expression and a script's end; inserted
// in the database as it is (the JSON API would remove the markup)
const INJECTION = {
  name: '{{ 1+1 }} <b>x</b></script>',
  shortname: 'header-injection',
  owner: 'foo',
  created: (new Date()).toJSON(),
  collaborators: { list: [{ userID: 'anyone', nickname: 'anyone', username: 'anyone', name: 'Any User', access: { collaborators: 'view', annotations: 'view', files: 'view' } }] },
  files: { list: [] },
  annotations: { list: [] }
};

/**
 * What the project page's nwl-components header shows
 * @param {Object} page A puppeteer page
 * @returns {Promise<Object>} Title, Nav links, login links, footers, the hand-made header's elements
 */
const projectHeader = async (page) => {
  await page.waitForSelector('#bb-header-app > header nav#menu .login a');

  return page.evaluate(() => ({
    title: document.querySelector('#bb-header-app > header .title').textContent,
    navLinks: [...document.querySelectorAll('#bb-header-app > header nav#menu > a')].map((a) => a.getAttribute('href')),
    logIn: [...document.querySelectorAll('#bb-header-app > header nav#menu .login a')].map((a) => [a.textContent.trim(), a.getAttribute('href')]),
    footers: document.querySelectorAll('footer, #bb-footer-app').length,
    handMade: document.querySelectorAll('.bb-header, .bb-footer, #MyLogin, #addProject, #settings, #fontLogo').length
  }));
};

describe('Headers and footers', function () {
  let browser;
  let page;

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    browser = await puppeteer.launch({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  });

  afterEach(async function () {
    if (page) { await page.close(); }
    page = null;
  });

  after(async function () {
    if (browser) { await browser.close(); }
  });

  it('shows nwl-components\' header, with its Nav, and footer on the ask-for-login page', async function () {
    page = await openPage(browser, '/project/new');
    await page.waitForSelector('.app > header nav#menu');
    const found = await page.evaluate(() => ({
      title: document.querySelector('.app > header .title').textContent.trim(),
      navLinks: [...document.querySelectorAll('.app > header nav#menu > a')].map((a) => a.getAttribute('href')),
      logIn: [...document.querySelectorAll('.app > header nav#menu .login a')].map((a) => [a.textContent.trim(), a.getAttribute('href')]),
      footer: document.querySelectorAll('.app > footer').length,
      message: document.querySelector('.app > main h1').textContent.trim(),
      handMade: document.querySelectorAll('#MyLogin, .footerLinks').length
    }));
    assert.deepEqual(found, {
      title: 'BrainBox',
      navLinks: ['/project/new', 'https://openneurolab.github.io/metasearch', 'https://github.com/neuroanatomy/BrainBox', 'https://github.com/neuroanatomy/BrainBox/issues/new', 'https://github.com/neuroanatomy/BrainBox'],
      logIn: [['Log in with GitHub', '/auth/github']],
      footer: 1,
      message: 'Log in required',
      handMade: 0
    });
  }).timeout(U.longTimeout);

  it('shows nwl-components\' header and footer on the MRI page, logged out', async function () {
    page = await openPage(browser, `/mri?url=${U.localBertURL}`);
    assert.deepEqual(await mriHeaderFooter(page), {
      title: 'BrainBox',
      navLinks: MRI_NAV,
      logIn: [['Log in with GitHub', '/auth/github']],
      footers: 1,
      handMade: 0
    });
  }).timeout(U.longTimeout);

  it('shows the logged user and Log Out in the MRI page\'s header', async function () {
    await F.addSession(VISITOR);
    try {
      page = await openPage(browser, `/mri?url=${U.localBertURL}`, [F.browserCookie(VISITOR)]);
      assert.deepEqual(await mriHeaderFooter(page), {
        title: 'BrainBox',
        navLinks: MRI_NAV,
        logIn: [[VISITOR, `/user/${VISITOR}`], ['Log Out', '/logout']],
        footers: 1,
        handMade: 0
      });
    } finally {
      await F.removeSession(VISITOR);
    }
  }).timeout(U.longTimeout);

  // the hand-made header was 76px high: the viewer under the nwl one has not moved
  it('keeps the MRI page\'s viewer where it was', async function () {
    page = await openPage(browser, `/mri?url=${U.localBertURL}`);
    await page.waitForSelector('#bb-header-app > header nav#menu');
    const found = await page.evaluate(() => ({
      header: document.querySelector('#bb-header-app').getBoundingClientRect().height,
      content: document.querySelector('#bb-header-app').nextElementSibling.getBoundingClientRect().top,
      // nwl-components' ScriptConsole styles #logScript too: the viewer's keeps its own
      // (not nwl's relative and 60px; hidden here, its min-height auto computes as 0px)
      logScript: ['position', 'min-height'].map((p) => getComputedStyle(document.querySelector('#logScript')).getPropertyValue(p)),
      // the footer, as on the other pages
      footer: ['height', 'font-family', 'box-sizing'].map((p) => getComputedStyle(document.querySelector('#bb-footer-app > footer')).getPropertyValue(p))
    }));
    assert.deepEqual(found, {
      header: 76,
      content: 76,
      logScript: ['static', '0px'],
      footer: ['100px', '"Source Sans 3", "Lucida Grande", "Lucida Sans Unicode", Helvetica, Arial, Verdana, sans-serif', 'border-box']
    });
  }).timeout(U.longTimeout);

  it('shows nwl-components\' header on the project page, logged out, with the settings link', async function () {
    page = await openPage(browser, `/project/${U.projectTest.shortname}`);
    assert.deepEqual(await projectHeader(page), {
      title: U.projectTest.name,
      navLinks: projectNav(U.projectTest.shortname),
      logIn: [['Log in with GitHub', '/auth/github']],
      footers: 0,
      handMade: 0
    });
  }).timeout(U.longTimeout);

  // the visitor is not a collaborator of the project: the settings link shows, as before
  it('shows the logged user, Log Out and the settings link in the project page\'s header', async function () {
    await F.addSession(VISITOR);
    try {
      page = await openPage(browser, `/project/${U.projectTest.shortname}`, [F.browserCookie(VISITOR)]);
      assert.deepEqual(await projectHeader(page), {
        title: U.projectTest.name,
        navLinks: projectNav(U.projectTest.shortname),
        logIn: [[VISITOR, `/user/${VISITOR}`], ['Log Out', '/logout']],
        footers: 0,
        handMade: 0
      });
    } finally {
      await F.removeSession(VISITOR);
    }
  }).timeout(U.longTimeout);

  it('shows the project\'s name as text in the project page\'s header', async function () {
    await U.getNativeDB().collection('project')
      .insertOne({ ...INJECTION });
    try {
      const errors = [];
      page = await openPage(browser, `/project/${INJECTION.shortname}`, [], errors);
      const found = await projectHeader(page);
      const more = await page.evaluate(() => ({
        bold: document.querySelectorAll('#bb-header-app b').length,
        // the inline script ran whole: its constants are defined
        // eslint-disable-next-line no-undef
        projectInfoName: projectInfo.name,
        accessLevel: typeof annotationsAccessLevel,
        documentTitle: document.title
      }));
      assert.deepEqual({ ...found, ...more, errors }, {
        title: INJECTION.name,
        navLinks: projectNav(INJECTION.shortname),
        logIn: [['Log in with GitHub', '/auth/github']],
        footers: 0,
        handMade: 0,
        bold: 0,
        projectInfoName: INJECTION.name,
        accessLevel: 'string',
        documentTitle: INJECTION.name,
        errors: []
      });
    } finally {
      await U.removeProject(INJECTION.shortname);
    }
  }).timeout(U.longTimeout);

  // the hand-made header was 76px high: the viewer under the nwl one has not moved
  it('keeps the project page\'s viewer where it was', async function () {
    page = await openPage(browser, `/project/${U.projectTest.shortname}`);
    await page.waitForSelector('#bb-header-app > header nav#menu');
    const found = await page.evaluate(() => ({
      header: document.querySelector('#bb-header-app').getBoundingClientRect().height,
      content: document.querySelector('#content').getBoundingClientRect().top
    }));
    assert.deepEqual(found, { header: 76, content: 76 });
  }).timeout(U.longTimeout);

  it('gives the MRI page\'s footer the --nwl-bg-canvas background', async function () {
    page = await openPage(browser, `/mri?url=${U.localBertURL}`);
    await page.waitForSelector('#bb-footer-app > footer');
    const backgrounds = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.backgroundColor = 'var(--nwl-bg-canvas)';
      document.body.appendChild(probe);
      const token = getComputedStyle(probe).backgroundColor;
      probe.remove();

      return { footer: getComputedStyle(document.querySelector('#bb-footer-app > footer')).backgroundColor, token };
    });
    assert.deepEqual(backgrounds, { footer: 'rgb(0, 0, 0)', token: 'rgb(0, 0, 0)' });
  }).timeout(U.longTimeout);
});
