'use strict';

const { test } = require('../browser');
const fs = require('fs');
const puppeteer = require('puppeteer');
const {PNG} = require('pngjs');
const pixelmatch = require('pixelmatch');
const assert = require('assert');

const timeout = 30*1000; // time in milliseconds
let browser;
let page;

function delay(delayTimeout) {
//    console.log('  delay', timeout, 'milliseconds');

    return new Promise((resolve) => {
        setTimeout(resolve, delayTimeout);
    });
}

function compareImages(pathImg1, pathImg2) {
    const data1 = fs.readFileSync(pathImg1);
    const data2 = fs.readFileSync(pathImg2);
    const img1 = PNG.sync.read(data1);
    const img2 = PNG.sync.read(data2);
    const pixdiff = pixelmatch(img1.data, img2.data, null, img1.width, img1.height);

    return pixdiff;
}

async function comparePageScreenshots(testPage, url, filename) {
    const pr = new Promise((resolve, reject) => {
        const newPath = './test/screenshots/' + filename;
        const refPath = './test/data/reference-screenshots/' + filename;
        // console.log("go to page:", url);
        testPage.goto(url, {waitUntil: 'domcontentloaded'});
        delay(5000)
        .then(() => { return testPage.screenshot({path:'./test/screenshots/' + filename})})
        .then(() => {
            const pixdiff = compareImages(newPath, refPath);
            // console.log("  pixdiff:", pixdiff);
            resolve(pixdiff);
        })
        .catch( (err) => {
            reject(err);
        });
    });

    return pr;
}

describe('Check testing works', () => {
  it( 'test1', () => {
    const result = true;
    assert.strictEqual( result, true );
  });
});

describe('Load index page', async () => {
    it('can access index page', test(async (browser, options) => {
        const page = await browser.newPage();
        await page.goto(`${options.appUrl}`);
        await page.waitFor('h2');
        const headerText = await page.evaluate(() => {
            return document.querySelector('h2').innerText;
        }, 'h2');
        assert.equal(headerText, 'Real-time collaboration in neuroimaging');
    }));
});

describe('Test website rendering', async () => {
    it('Browser opens', async () => {
        browser = await puppeteer.launch({headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    });

    it('Page opens', async () => {
        page = await browser.newPage();
        await page.setViewport({width: 1600, height: 1200});
    }).timeout(timeout);

    // OPEN HOMEPAGE
    it('Home page renders as expected', async () => {
        const diff = await comparePageScreenshots(
            page,
            'http://localhost:3001',
            '01.home.png'
        );
        console.log(diff);
        assert(diff<1000);
    }).timeout(timeout);

    // OPEN MRI PAGE
    it('MRI page renders as expected', async () => {
        const diff = await comparePageScreenshots(
            page,
            'http://localhost:3001/mri?url=https://zenodo.org/record/44855/files/MRI-n4.nii.gz',
            '02.mri.png'
        );
        assert(diff<1000);
    }).timeout(timeout);

    // OPEN PROJECT PAGE
    it('Project page renders as expected', async () => {
        const diff = await comparePageScreenshots(
            page,
            'http://localhost:3001/project/test',
            '03.project.png'
        );
        assert(diff<1000);
    }).timeout(timeout);

    // OPEN PROJECT SETTINGS PAGE
    it('Project Settings page renders as expected', async () => {
        const diff = await comparePageScreenshots(
            page,
            'http://localhost:3001/project/test/settings',
            '04.project-settings.png'
        );
        assert(diff<1000);
    }).timeout(timeout);

    // OPEN USER PAGE
    it('User page renders as expected', async () => {
        const diff = await comparePageScreenshots(
            page,
            'http://localhost:3001/user/r03ert0',
            '05.user.png'
        );
        assert(diff<1000);
    }).timeout(timeout);

    // CLOSE
    it('Browser closes successfully', async () => {
        await browser.close();
    }).timeout(timeout);

});