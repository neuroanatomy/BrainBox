const puppeteer = require('puppeteer');

// Options for headless browser
const browserOpts = {
  appUrl: 'https://localhost:3001',
  lionUrl: 'https://localhost:3001/mri?url=https://zenodo.org/record/44855/files/MRI-n4.nii.gz',
  args: ['--no-sandbox']
};

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

/**
 * Headless browser singleton 
 * (ref: https://medium.com/@ivanmontiel/using-that-headless-chrome-youve-been-hearing-about-543a8cc07af5)
 * 
 * @class Browser
 */
class Browser {
  /**
   * Initialise the browser class
   * 
   * @param {any} done Callback function from mocha
   * @memberof Browser
   */
  init(done) {
    puppeteer.launch(browserOpts).then(async (browser) => {
      this.setBrowser(browser);
      done();
    });
  }

  /**
   * Set up the browser instance
   * 
   * @param {any} browser Browser instance
   * @memberof Browser
   */
  setBrowser(browser) {
    this.browser = browser;
    const oldNewPage = this.browser.newPage.bind(this.browser);

    this.browser.newPage = async function () {
      const page = await oldNewPage();
      this.lastPage = page;

      return page;
    };
  }

  /**
   * Wrapper for writing tests in the browser context
   * 
   * @param {Promise} promise Promise that resolves to browser actions
   * @returns 
   * @memberof Browser
   */
  test(promise) {
    return (done) => {
      promise(this.browser, browserOpts)
        .then(() => done()).catch(done);
    };
  }
}

/*
 * Create a new browser and use a proxy to pass
 * any puppeteer calls to the inner browser
 */
module.exports = new Proxy(new Browser(), {
  get(target, name) {
    return name in target ? target[name].bind(target) : target.browser[name];
  }
});
