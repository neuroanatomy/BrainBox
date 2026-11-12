'use strict';

/*
  The pages' own stylesheets read nwl-components' tokens (var(--nwl-…), UI kit step 4), so
  each page bundle that has such a stylesheet loads nwl-components/tokens.css. On the home
  and ask-for-login pages, which load no other nwl-components stylesheet, a token is defined
  and the body gets its colours and font through the tokens.
*/

const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const U = require('../utils.js');

const EXPECTED = {
  token: '#222',
  background: 'rgb(34, 34, 34)',
  font: '"Lucida Grande", "Lucida Sans Unicode", Helvetica, Arial, Verdana, sans-serif'
};

/**
 * A page's --nwl-bg token, and its body's background colour and font family
 * @param {Object} browser A puppeteer browser
 * @param {string} url The page's URL
 * @returns {Promise<Object>} The token's value, the background colour and the font family
 */
const tokenStyles = async (browser, url) => {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'load' });

    return await page.evaluate(() => {
      const body = getComputedStyle(document.body);

      return {
        token: getComputedStyle(document.documentElement).getPropertyValue('--nwl-bg')
          .trim(),
        background: body.backgroundColor,
        font: body.fontFamily
      };
    });
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

  it('defines the tokens on the ask-for-login page', async function () {
    assert.deepEqual(await tokenStyles(browser, `${U.serverURL}/project/new`), EXPECTED);
  }).timeout(U.longTimeout);
});
