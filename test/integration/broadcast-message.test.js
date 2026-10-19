/* global AtlasMakerWidget */
'use strict';

/*
  Browser tests for the admin's broadcast message (POST /admin/broadcast-message):
  the users who have a viewer open (MRI page, project page, embedded viewer) see
  the message, and the answer says how many users it was sent to.
*/

const puppeteer = require('puppeteer');
const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');
const admins = require('../../controller/admin/admins');

const adminToken = U.testToken + 'foo';
const MRI_PAGE = `${U.serverURL}/mri?url=${U.localBertURL}`;
const PROJECT_PAGE = `${U.serverURL}/project/${U.projectTest.shortname}`;
const EMBED_PAGE = `${U.serverURL}/mri/embed?url=${encodeURIComponent(U.localBertURL)}`;

// In the page: whether a visible element shows the text
const visibleText = (text) => [...document.querySelectorAll('body *')]
  .some((el) => el.children.length === 0 && el.textContent.includes(text)
    && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');

/**
 * Open a page with a viewer, wait for its WebSocket connection, broadcast a
 * message as admin, and check the answer and that the page shows the message
 * @param {Object} browser A puppeteer browser
 * @param {string} url The page to open
 * @param {string} text The message
 * @returns {Promise<void>} Resolves once checked
 */
const checkBroadcast = async (browser, url, text) => {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1200, height: 900 });
    await U.blockExternalRequests(page);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.AtlasMakerWidget && AtlasMakerWidget.flagConnected === 1,
      { timeout: U.longTimeout }
    );
    const res = await chai.request(U.serverURL).post('/admin/broadcast-message')
      .query({ token: adminToken })
      .send({ msg: text });
    assert.equal(res.statusCode, 200);
    // the answer says how many users got it: 0 when the message reached nobody
    assert.isAtLeast(res.body.users, 1);
    assert.include(res.body.msg, text);
    await page.waitForFunction(visibleText, { timeout: U.shortTimeout }, text)
      .catch(() => null);
    assert.isTrue(await page.evaluate(visibleText, text), 'the page does not show the message');
  } finally {
    await page.close();
  }
};

describe('TESTING THE ADMIN BROADCAST MESSAGE IN THE VIEWER', function () {
  let browser;
  let previousAdmins;

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    previousAdmins = admins.getAdmins();
    admins.setAdmins(['foo']);
    browser = await puppeteer.launch({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  });

  after(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    admins.setAdmins(previousAdmins);
    if (browser) { await browser.close(); }
    // Like the other suites using the test brain, remove it once the browser is closed:
    // the project page adds the project's layer to it and saves it, and the next suite
    // (client.js) expects a test brain with only its own layer.
    const res = await chai.request(U.serverURL).get('/mri/json')
      .query({ url: U.localBertURL });
    if (res.body && res.body.url) {
      await U.removeMRI({ dirPath: './public' + res.body.url, srcURL: U.localBertURL });
    }
  });

  it('shows the message to a user who has the MRI page open', async function () {
    await checkBroadcast(browser, MRI_PAGE, 'The server restarts at 18:00 (MRI page)');
  }).timeout(U.longTimeout);

  it('shows the message to a user who has a project page open', async function () {
    await checkBroadcast(browser, PROJECT_PAGE, 'The server restarts at 18:00 (project page)');
  }).timeout(U.longTimeout);

  it('shows the message to a user who has an embedded viewer open', async function () {
    await checkBroadcast(browser, EMBED_PAGE, 'The server restarts at 18:00 (embedded viewer)');
  }).timeout(U.longTimeout);
});
