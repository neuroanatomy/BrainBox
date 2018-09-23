'use strict';

const fs = require('fs');
const puppeteer = require('puppeteer');
const {PNG} = require('pngjs');
const pixelmatch = require('pixelmatch');
const assert = require('assert');

function delay(timeout) {
    console.log('  delay', timeout, 'milliseconds');

    return new Promise((resolve) => {
        setTimeout(resolve, timeout);
    });
}

function compareImages(pathImg1, pathImg2) {
    const data1 = fs.readFileSync(pathImg1);
    const data2 = fs.readFileSync(pathImg2);
    const img1 = PNG.sync.read(data1);
    const img2 = PNG.sync.read(data2);
    const pixdiff = pixelmatch(img1.data, img2.data);

    return pixdiff;
}

function comparePageScreenshots(page, url, filename) {
    const newPath = 'screenshots/' + filename;
    const refPath = 'data/reference-screenshots/' + filename;
    const pr = new Promise((resolve, reject) => {
        console.log("go to page:", url);
        page.goto(url);
        delay(5000)
        .then(() => { return page.screenshot({path:'screenshots/' + filename})})
        .then(() => {
            const pixdiff = compareImages(newPath, refPath);
            console.log("  pixdiff:", pixdiff);
            resolve(pixdiff);
        })
        .catch( (err) => {
            reject(err);
        });
    });

    return pr;
}

puppeteer.launch({headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
.then(function(browser) {
    console.log('puppeteer launched');
    browser.newPage()
    .then(function(page) {
        console.log('browser open');

        // set viewport
        page.setViewport({width: 1600, height: 1200})

        // OPEN HOMEPAGE
        .then(() => {return comparePageScreenshots(
            page,
            'http://localhost:3001',
            '01.home.png'
        )})

        // OPEN MRI PAGE
        .then(() => {return comparePageScreenshots(
            page,
            'http://localhost:3001/mri?url=https://zenodo.org/record/44855/files/MRI-n4.nii.gz',
            '02.mri.png'
        )})

        // OPEN PROJECT PAGE
        .then(() => {return comparePageScreenshots(
            page,
            'http://localhost:3001/project/braincatalogue',
            '03.project.png'
        )})

        // OPEN PROJECT SETTINGS PAGE
        .then(() => {return comparePageScreenshots(
            page,
            'http://localhost:3001/project/braincatalogue/settings',
            '04.project-settings.png'
        )})

        // OPEN USER PAGE
        .then(() => {return comparePageScreenshots(
            page,
            'http://localhost:3001/user/r03ert0',
            '05.user.png'
        )})

        // CLOSE
        .then(() => browser.close())
        .then(function() { console.log('browser closed'); })

        // HANDLE ERRORS
        .catch((err) => {
            console.error("TESTS ABORTED");
            console.error(err);
            browser.close();
        });
    });
})
.catch((e)=>console.error(e));
