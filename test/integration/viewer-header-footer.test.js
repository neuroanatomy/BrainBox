'use strict';

/*
  Headers and footers (UI kit step 10). The ask-for-login page uses nwl-components' Vue
  Header (with its Nav) and Footer, as the user and admin pages do, and its Log In link
  goes to GitHub. The MRI and project pages keep their own header (and the MRI page its
  footer), from templates/partials, styled by classes of style.css: no inline style, and
  the footer's background is the --nwl-bg-canvas token. No MRI is downloaded: the requests
  for MRI data are aborted.
*/

const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const U = require('../utils.js');

/**
 * Open a page logged out, with only our server's requests and no MRI data
 * @param {Object} browser A puppeteer browser
 * @param {string} path The page's path
 * @returns {Promise<Object>} The page
 */
const openPage = async (browser, path) => {
  const page = await browser.newPage();
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
 * The elements of a page's header and footer that have a style attribute
 * @param {Object} page A puppeteer page
 * @returns {Promise<Array<string>>} Their tag names and ids
 */
const styledElements = (page) => page.evaluate(() => [...document.querySelectorAll('.bb-header, .bb-header *, .bb-footer-space, .bb-footer, .bb-footer *')]
  .filter((el) => el.hasAttribute('style'))
  .map((el) => `${el.tagName.toLowerCase()}#${el.id}`));

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

  it('gives the MRI page\'s header and footer no inline style', async function () {
    page = await openPage(browser, `/mri?url=${U.localBertURL}`);
    await page.waitForSelector('.bb-header #menu #addProject');
    await page.waitForSelector('.bb-footer .footerLinks');
    assert.deepEqual(await styledElements(page), []);
  }).timeout(U.longTimeout);

  // the project page has a header and no footer
  it('gives the project page\'s header no inline style', async function () {
    page = await openPage(browser, `/project/${U.projectTest.shortname}`);
    await page.waitForSelector('.bb-header #menu #settings');
    assert.deepEqual(await styledElements(page), []);
    assert.strictEqual(await page.$$eval('.bb-footer', (els) => els.length), 0);
  }).timeout(U.longTimeout);

  it('gives the MRI page\'s footer the --nwl-bg-canvas background', async function () {
    page = await openPage(browser, `/mri?url=${U.localBertURL}`);
    await page.waitForSelector('.bb-footer .footerLinks');
    const backgrounds = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.backgroundColor = 'var(--nwl-bg-canvas)';
      document.body.appendChild(probe);
      const token = getComputedStyle(probe).backgroundColor;
      probe.remove();

      return { footer: getComputedStyle(document.querySelector('.bb-footer')).backgroundColor, token };
    });
    assert.deepEqual(backgrounds, { footer: 'rgb(0, 0, 0)', token: 'rgb(0, 0, 0)' });
  }).timeout(U.longTimeout);
});
