'use strict';
const puppeteer = require('puppeteer');


function delay(timeout) {
    console.log('delay', timeout, 'milliseconds');

    return new Promise((resolve) => {
        setTimeout(resolve, timeout);
    });
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
        .then(() => {
          console.log('go to home page');
          page.goto('http://localhost:3000');
        })
        .then(() => delay(5000))
        .then(() => page.screenshot({path:'screenshots/01.home.png'}))

        // OPEN MRI PAGE
        .then(() => {
          console.log('go to MRI');
          page.goto('http://localhost:3000/mri?url=https://zenodo.org/record/44855/files/MRI-n4.nii.gz');
        })
        .then(() => delay(5000))
        .then(() => page.screenshot({path:'screenshots/02.mri.png'}))

        // OPEN PROJECT PAGE
        .then(() => {
          console.log('go to Project');
          page.goto('http://localhost:3000/project/braincatalogue');
        })
        .then(() => delay(5000))
        .then(() => page.screenshot({path:'screenshots/03.project.png'}))

        // OPEN PROJECT SETTINGS PAGE
        .then(() => {
          console.log('go to Project Settings');
          page.goto('http://localhost:3000/project/braincatalogue/settings');
        })
        .then(() => delay(5000))
        .then(() => page.screenshot({path:'screenshots/04.project-settings.png'}))

        // OPEN USER PAGE
        .then(() => {
          console.log('go to User');
          page.goto('http://localhost:3000/user/r03ert0');
        })
        .then(() => delay(5000))
        .then(() => page.screenshot({path:'screenshots/05.user.png'}))

        // CLOSE
        .then(() => browser.close())
        .then(function() { console.log('browser closed'); });
    });
});
