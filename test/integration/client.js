const { test } = require('../browser');
const assert = require('assert');

describe('index page', () => {
    it('can access index page', test(async (browser, options) => {
        const page = await browser.newPage();
        
        await page.goto(`${options.appUrl}`);
        await page.waitFor('h2');

        const headerText = await page.evaluate((selection) => {
            return document.querySelector('h2').innerText;
        }, 'h2');

        assert.equal(headerText, 'Real-time collaboration in neuroimaging');
    }));
});
