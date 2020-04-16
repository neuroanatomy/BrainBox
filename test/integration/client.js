'use strict';

const { test } = require('../browser');
const fs = require('fs');
const puppeteer = require('puppeteer');
const assert = require('assert');
const U = require('../utils.js');

describe('TESTING CLIENT-SIDE RENDERING', () => {
    describe('Check testing works', () => {
        it( 'test1', () => {
            const result = true;
            assert.strictEqual( result, true );
        });
    });

    describe('Load index page', async () => {
        let browser;
        let page;

        it('Browser opens', async () => {
            browser = await puppeteer.launch({headless: true, ignoreHTTPSErrors: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        });

        it('can access index page', async () => {
            page = await browser.newPage();
            await page.goto('https://localhost:3001');
            await page.waitFor('h2');
            const headerText = await page.evaluate(() => document.querySelector('h2').innerText, 'h2');
            assert.equal(headerText, 'Real-time collaboration in neuroimaging');
        });
    });

    describe('Test website rendering', async function () {
        let browser;
        let page;

        it('Browser opens', async () => {
            browser = await puppeteer.launch({headless: true, ignoreHTTPSErrors: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        });

        it('Page opens', async () => {
            page = await browser.newPage();
            await page.setViewport({width: 1600, height: 1200});
        }).timeout(U.longTimeout);

        // OPEN HOMEPAGE
        it('Home page renders as expected', async () => {
            const diff = await U.comparePageScreenshots(
                page,
                'https://localhost:3001',
                '01.home.png'
            );
            assert(diff<1000);
        }).timeout(U.longTimeout);

        // OPEN MRI PAGE
        it('MRI page renders as expected', async () => {
            const diff = await U.comparePageScreenshots(
                page,
                'https://localhost:3001/mri?url=https://zenodo.org/record/44855/files/MRI-n4.nii.gz',
                '02.mri.png'
            );
            assert(diff<1000);
        }).timeout(U.longTimeout);

        // ASK FOR AUTHENTICATION IF CREATING A PROJECT
        it('"Ask for login" renders as expected', async () => {
            const diff = await U.comparePageScreenshots(
                page,
                'https://localhost:3001/project/new',
                '03.ask-for-login.png'
            );
            assert(diff<1000);
        }).timeout(U.longTimeout);

        // OPEN PROJECT PAGE
        it('Project page renders as expected', async () => {
            const diff = await U.comparePageScreenshots(
                page,
                'https://localhost:3001/project/' + U.projectTest.shortname,
                '04.project.png'
            );
            assert(diff<1000);
        }).timeout(U.longTimeout);        // OPEN PROJECT SETTINGS PAGE FOR EXISTING PROJECT
        it('Project Settings page for an existing project renders as expected', async () => {
            const diff = await U.comparePageScreenshots(
                page,
                `https://localhost:3001/project/${U.projectTest.shortname}/settings`,
                '05.project-settings-existing.png'
            );
            assert(diff<1000);
        }).timeout(U.longTimeout);

        // OPEN PROJECT SETTINGS PAGE FOR EMPTY PROJECT
        it('Project Settings page for an empty project renders as expected', async () => {
            const diff = await U.comparePageScreenshots(
                page,
                'https://localhost:3001/project/nonexisting/settings',
                '06.project-settings-nonexisting.png'
            );
            assert(diff<1000);
        }).timeout(U.longTimeout);

        // OPEN USER PAGE
        it('User page renders as expected', async () => {
            const diff = await U.comparePageScreenshots(
                page,
                'https://localhost:3001/user/' + U.userFoo.nickname,
                '07.user.png'
            );
            assert(diff<1000);
        }).timeout(U.longTimeout);

        // CLOSE
        it('Browser closes successfully', async () => {
            await browser.close();
        }).timeout(U.longTimeout);
    });
});

