/* eslint-disable max-statements */
'use strict';

// require('../browser');
const fs = require('fs');

const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
const puppeteer = require('puppeteer');

chai.use(chaiHttp);
const U = require('../utils.js');

describe('TESTING CLIENT-SIDE RENDERING', function () {
  // after(async function () {
  //     // remove the MRI
  //     await chai.request(U.serverURL).get('/--------------------after hook')
  //     const res = await chai.request(U.serverURL).get('/mri/json').query({
  //     url: U.localBertURL
  //     });
  //     const {body} = res;
  //     const dirPath = "./public" + body.url;
  //     await U.removeMRI({dirPath, srcURL: U.localBertURL});
  //     await chai.request(U.serverURL).get('/--------------------')
  // });

  describe('Test website rendering', function () {
    let browser;
    let page;

    const pageWidth = 1600;
    const pageHeight = 1200;

    before(async function () {
      // Remove screenshot directory (require node v14+ to work)
      await fs.promises.rm('./test/screenshots/', { recursive: true, force: true });
    });

    it('Browser opens', async function () {
      browser = await puppeteer.launch({ headless: true, ignoreHTTPSErrors: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    }).timeout(U.shortTimeout);

    it('Can access index page', async function () {
      page = await browser.newPage();
      page.on('console', (msg) => {
        console.log(`PAGE ${msg.type().toUpperCase()}: ${msg.text()}`);
      });
      await page.setViewport({ width: pageWidth, height: pageHeight });
      await page.goto(U.serverURL);
      await page.waitForSelector('h2');
      const headerText = await page.evaluate(() => document.querySelector('h2').innerText, 'h2');
      assert.equal(headerText, 'Real-time collaboration in neuroimaging');
    }).timeout(U.longTimeout);

    // OPEN HOMEPAGE
    it('Home page renders as expected', async function () {
      await U.waitForDOMReady(page, U.serverURL);

      const elements = await page.evaluate(() => ({
        menu: document.querySelectorAll('#menu'),
        menuLinksLength: document.querySelectorAll('#menu a').length,
        urlInput: document.querySelectorAll('#url'),
        list: document.querySelectorAll('#list'),
        go: document.querySelectorAll('#go')
      }));

      assert.equal(true, U.isDomElementVisible(elements.menu));
      assert.equal(5, elements.menuLinksLength);
      assert.equal(true, U.isDomElementVisible(elements.urlInput));
      assert.equal(true, U.isDomElementVisible(elements.list));
      assert.equal(true, U.isDomElementVisible(elements.go));
    }).timeout(U.noTimeout);

    // OPEN MRI PAGE
    it('MRI page renders as expected', async function () {
      await page.goto(U.serverURL + '/mri?url=' + U.localBertURL);
      const pane = await page.waitForSelector('#annotations tbody tr', { timeout: 10000 });
      assert.equal(1, await page.evaluate(() => document.querySelectorAll('#annotations tbody tr').length));
      assert.equal('Foreground', await pane.$eval('.annotation-label', (node) => node.innerText));

    }).timeout(U.noTimeout);

    // ASK FOR AUTHENTICATION IF CREATING A PROJECT
    it('"Ask for login" renders as expected', async function () {
      await page.goto(U.serverURL + '/project/new');
      const title = await page.waitForSelector('h1', { timeout: 10000 });
      assert.equal('Log in required', await title.evaluate((node) => node.innerText));
    }).timeout(U.noTimeout);

    // OPEN PROJECT PAGE
    it('Project page renders as expected', async function () {
      await page.goto(U.serverURL + '/project/' + U.projectTest.shortname);
      await page.waitForSelector('.editor .tools');
      await page.waitForSelector('.editor .tools .range-slider');
      await page.waitForSelector('.editor .tools button[title="Change pen size to 1"]');
      await page.waitForSelector('.editor .tools button[title="Change pen size to 15"]');
      await page.waitForSelector('canvas');
      await page.waitForSelector('.editor .tools .notifications');
      await page.waitForSelector('.editor .tools .chat input[type=text]');

      const annotation = await page.waitForSelector('#volAnnotations tbody tr td:first-child');
      assert.equal('Cerebrum', await page.evaluate((el) => el.textContent, annotation));
      const annotationValue = await page.waitForSelector('#volAnnotations tbody tr td:last-child');
      assert.equal('cerebellum.json', await page.evaluate((el) => el.textContent, annotationValue));
    }).timeout(U.noTimeout); // OPEN PROJECT SETTINGS PAGE FOR EXISTING PROJECT

    it('Project Settings page for an existing project renders as expected', async function () {
      await page.goto(U.serverURL + '/project/' + U.projectTest.shortname + '/settings');
      const access = await page.waitForSelector('#access');
      assert.equal(1, await access.$$eval('tbody tr', ((nodes) => nodes.length)));
      assert.equal('anyone', await access.$eval('input', ((node) => node.value)));

      const annotations = await page.waitForSelector('#annotations');
      assert.equal(1, await annotations.$$eval('tbody tr', ((nodes) => nodes.length)));
      assert.equal('Cerebrum', await annotations.$eval('tbody tr td:first-child input', ((node) => node.value)));
      assert.equal('cerebellum.json', await annotations.$eval('tbody tr td:nth-child(3) select', ((node) => node.value)));

      const files = await page.waitForSelector('#files');
      assert.equal(5, await files.$$eval('tbody tr', ((nodes) => nodes.length)));
      assert.deepEqual([
        'http://127.0.0.1:3001/test_data/bert_brain.nii.gz',
        'https://zenodo.org/record/44855/files/MRI-n4.nii.gz',
        'http://files.figshare.com/2284784/MRI_n4.nii.gz',
        'https://dl.dropbox.com/s/cny5b3so267bv94/p32-f18-uchar.nii.gz',
        'https://s3.amazonaws.com/fcp-indi/data/Projects/ABIDE_Initiative/Outputs/freesurfer/5.1/Caltech_0051456/mri/T1.mgz'
      ], await files.$$eval('tbody tr td:first-child', ((nodes) => Array.from(nodes).map((node) => node.innerText))));

    }).timeout(U.noTimeout);

    // OPEN PROJECT SETTINGS PAGE FOR EMPTY PROJECT
    it('Project Settings page for an empty project renders as expected', async function () {
      await page.goto(U.serverURL + '/project/nonexisting/settings');
      const access = await page.waitForSelector('#access');
      assert.equal(1, await access.$$eval('tbody tr', ((nodes) => nodes.length)));
      assert.equal('anyone', await access.$eval('input', ((node) => node.value)));

      const annotations = await page.waitForSelector('#annotations');
      assert.equal(1, await annotations.$$eval('tbody tr', ((nodes) => nodes.length)));

      await page.waitForSelector('#files');
    }).timeout(U.noTimeout);

    // OPEN USER PAGE
    it('User page renders as expected', async function () {
      await page.goto(U.serverURL + '/user/' + U.userFoo.nickname);
      const image = await page.waitForSelector('#userImage');
      assert.equal(U.userFoo.avatarURL, await image.$eval('img', ((node) => node.src)));
      const description = await page.waitForSelector('#userDescription');
      assert.equal(U.userFoo.name, await description.$eval('h1', ((node) => node.innerText)));
      assert.equal(U.userFoo.nickname, await description.$eval('h2', ((node) => node.innerText)));
      assert.equal('1 Projects ', await page.evaluate((el) => el.childNodes[4].textContent, description));

    }).timeout(U.noTimeout);

    // CLOSE
    it('Browser closes successfully', async function () {
      const pages = await browser.pages();
      await Promise.all(pages.map((p) => p.close()));
      await browser.close();
    }).timeout(U.noTimeout);

    it('Remove test MRI from db and disk', async function () {
      // remove the MRI
      const res = await chai.request(U.serverURL).get('/mri/json')
        .query({
          url: U.localBertURL
        });
      const { body } = res;
      const dirPath = './public' + body.url;
      await U.removeMRI({ dirPath, srcURL: U.localBertURL });
    });
  });
});

