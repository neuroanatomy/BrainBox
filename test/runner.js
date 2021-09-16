/* eslint-disable no-invalid-this */
const browser = require('./browser');
const U = require('./utils.js');

before(async function () {
  this.timeout(U.mediumTimeout);
  await U.insertUser(U.userFoo);
  await U.insertProject(U.projectTest);
  await U.insertTestTokenForUser("foo");
  await browser.init();
  // eslint-disable-next-line global-require
  require('../app');
});

after(async function () {
  await U.removeUser(U.userFoo.nickname);
  await U.removeProject(U.projectTest.shortname);
  await U.removeTestTokenForUser("foo");
  await browser.close();
});
