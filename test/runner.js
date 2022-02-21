// const browser = require('./browser');
const U = require('./utils.js');

before(async function () {
  // eslint-disable-next-line no-invalid-this
  this.timeout(U.longTimeout);
  await U.initResources();
  await U.insertUser(U.userFoo);
  await U.insertProject(U.privateProjectTest);
  await U.insertProject(U.projectTest);
  await U.insertTestTokenForUser('foo');
  // await browser.init();
});

after(async function () {
  await U.removeUser(U.userFoo.nickname);
  await U.removeProject(U.projectTest.shortname);
  await U.removeProject(U.privateProjectTest.shortname);
  await U.removeTestTokenForUser('foo');
  // await browser.close();
  await U.closeResources();
});
