const puppeteer = require('puppeteer');
const browserOpts = {
  appUrl: 'http://localhost:3000',
  args: ['--no-sandbox']
};

/**
 * Browser singleton (ref: https://medium.com/@ivanmontiel/using-that-headless-chrome-youve-been-hearing-about-543a8cc07af5)
 * 
 * @class Browser
 */
class Browser {
  setUp(done) {
    puppeteer.launch(browserOpts).then(async (browser) => {
      this.setBrowser(browser);
      done();
    });
  }

  setBrowser(browser) {
    this.browser = browser;
    const oldNewPage = this.browser.newPage.bind(this.browser);

    this.browser.newPage = async function () {
      const page = await oldNewPage();
      this.lastPage = page;

      return page;
    };
  }

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
