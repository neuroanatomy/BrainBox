'use strict';

/*
  The pages' own stylesheets read nwl-components' tokens (var(--nwl-…), UI kit step 4), so
  each page bundle that has such a stylesheet loads nwl-components/tokens.css. On the home
  page, which loads nwl-components' tokens, base and widget styles but not its components, a
  token is defined and the body gets its colours and font through the tokens, with the kit's
  values (nwl-components 3.0.0 defaults); on the project page too; on the ask-for-login page,
  which uses nwl-components' Vue components (UI kit step 10), its .app does.
*/

const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const U = require('../utils.js');

const EXPECTED = {
  token: '#1a1a1a',
  background: 'rgb(26, 26, 26)',
  font: '"Source Sans 3", "Lucida Grande", "Lucida Sans Unicode", Helvetica, Arial, Verdana, sans-serif'
};

/**
 * A page's --nwl-bg token, and an element's background colour and font family
 * @param {Object} browser A puppeteer browser
 * @param {string} url The page's URL
 * @param {string} selector The element (default: the body)
 * @returns {Promise<Object>} The token's value, the background colour and the font family
 */
const tokenStyles = async (browser, url, selector = 'body') => {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector(selector);

    return await page.evaluate((sel) => {
      const style = getComputedStyle(document.querySelector(sel));

      return {
        token: getComputedStyle(document.documentElement).getPropertyValue('--nwl-bg')
          .trim(),
        background: style.backgroundColor,
        font: style.fontFamily
      };
    }, selector);
  } finally {
    await page.close();
  }
};

describe('Pages load nwl-components\' tokens', function () {
  let browser;

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    browser = await puppeteer.launch({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  });

  after(async function () {
    if (browser) { await browser.close(); }
  });

  it('defines the tokens on the home page', async function () {
    assert.deepEqual(await tokenStyles(browser, `${U.serverURL}/`), EXPECTED);
  }).timeout(U.longTimeout);

  it('defines the tokens on the project page', async function () {
    assert.deepEqual(await tokenStyles(browser, `${U.serverURL}/project/${U.projectTest.shortname}`), EXPECTED);
  }).timeout(U.longTimeout);

  it('defines the tokens on the ask-for-login page', async function () {
    assert.deepEqual(await tokenStyles(browser, `${U.serverURL}/project/new`, '.app'), EXPECTED);
  }).timeout(U.longTimeout);
});
