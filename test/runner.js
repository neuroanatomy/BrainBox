const browser = require('./browser');

/**
 * Start headless browser before testing
 */
before((done) => {
  browser.init(done);
});

/**
 * Shut down headless browser after testing
 */
after(() => {
  browser.close();
});
