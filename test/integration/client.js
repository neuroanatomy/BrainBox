const { test } = require('../browser');
const assert = require('assert');

describe('Load index page', () => {
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

describe('Load Lion from Zenodo', () => {
    it('can access lion page', test(async (browser, options) => {
        const page = await browser.newPage();
        
        await page.goto(`${options.lionUrl}`);
        await page.waitFor('span#name');
        setTimeout(() => {
            const headerText = await page.evaluate(() => {
                return document.querySelector('span#name').innerText;
            }, 'span#name');

            assert.equal(headerText, 'Lion from Zenodo');
        }, 1000);
    }));
});
