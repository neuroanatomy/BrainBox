const browser = require('./browser');
const U = require('./utils.js');

before(async () => {
  await U.insertUser(U.userFoo);
  await U.insertProject(U.projectTest);
  await U.insertTestTokenForUser("foo");
  await browser.init();
});

after(async () => {
  await U.removeUser(U.userFoo.nickname);
  await U.removeProject(U.projectTest.shortname);
  await U.removeTestTokenForUser("foo");
  await browser.close();
});
