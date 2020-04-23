'use strict';

const { test } = require('../browser');
const fs = require('fs');
const puppeteer = require('puppeteer');
const chai = require('chai');
const assert = chai.assert;
const chaiHttp = require('chai-http');
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

        it('Browser opens', async function () {
            browser = await puppeteer.launch({headless: true, ignoreHTTPSErrors: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        });

        it('Can access index page', async function () {
            page = await browser.newPage();
            await page.setViewport({width: 1600, height: 1200});
            await page.goto(U.serverURL);
            await page.waitFor('h2');
            const headerText = await page.evaluate(() => document.querySelector('h2').innerText, 'h2');
            assert.equal(headerText, 'Real-time collaboration in neuroimaging');
        });

        // OPEN HOMEPAGE
        it('Home page renders as expected', async function () {
            const diff = await U.comparePageScreenshots(
                page,
                U.serverURL,
                '01.home.png'
            );
            assert(diff<1000, `${diff} pixels were different`);
        }).timeout(U.longTimeout);

        // OPEN MRI PAGE
        it('MRI page renders as expected', async function () {
            const diff = await U.comparePageScreenshots(
                page,
                U.serverURL + '/mri?url=' + U.localBertURL,
                '02.mri.png'
            );
            assert(diff<1000, `${diff} pixels were different`);
        }).timeout(U.longTimeout);

        // ASK FOR AUTHENTICATION IF CREATING A PROJECT
        it('"Ask for login" renders as expected', async function () {
            const diff = await U.comparePageScreenshots(
                page,
                U.serverURL + '/project/new',
                '03.ask-for-login.png'
            );
            assert(diff<1000, `${diff} pixels were different`);
        }).timeout(U.longTimeout);

        // OPEN PROJECT PAGE
        it('Project page renders as expected', async function () {
            const diff = await U.comparePageScreenshots(
                page,
                U.serverURL + '/project/' + U.projectTest.shortname,
                '04.project.png'
            );
            assert(diff<1000, `${diff} pixels were different`);
        }).timeout(U.longTimeout);        // OPEN PROJECT SETTINGS PAGE FOR EXISTING PROJECT
        it('Project Settings page for an existing project renders as expected', async function () {
            const diff = await U.comparePageScreenshots(
                page,
                `${U.serverURL}/project/${U.projectTest.shortname}/settings`,
                '05.project-settings-existing.png'
            );
            assert(diff<1000, `${diff} pixels were different`);
        }).timeout(U.longTimeout);

        // OPEN PROJECT SETTINGS PAGE FOR EMPTY PROJECT
        it('Project Settings page for an empty project renders as expected', async function () {
            const diff = await U.comparePageScreenshots(
                page,
                U.serverURL + '/project/nonexisting/settings',
                '06.project-settings-nonexisting.png'
            );
            assert(diff<1000, `${diff} pixels were different`);
        }).timeout(U.longTimeout);

        // OPEN USER PAGE
        it('User page renders as expected', async function () {
            const diff = await U.comparePageScreenshots(
                page,
                U.serverURL + '/user/' + U.userFoo.nickname,
                '07.user.png'
            );
            assert(diff<1000, `${diff} pixels were different`);
        }).timeout(U.longTimeout);

        // CLOSE
        it('Browser closes successfully', async function () {
            await browser.close();
        }).timeout(U.longTimeout);

        it('Remove test MRI from db and disk', async function () {
            // remove the MRI
            const res = await chai.request(U.serverURL).get('/mri/json').query({
              url: U.localBertURL
            });
            const {body} = res;
            const dirPath = "./public" + body.url;
            await U.removeMRI({dirPath, srcURL: U.localBertURL});
          });
    });
});

