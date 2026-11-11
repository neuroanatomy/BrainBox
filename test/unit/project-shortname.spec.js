const { expect } = require('chai');
const { isShortnameInput } = require('../../view/shared/projectShortname.js');

// the check of the new-project page while the short name is typed: the server accepts
// letters, numbers and hyphens in a new shortname (shared suite 2.6, 2026-11-11)
describe('The new-project page short name check', function () {
  it('accepts letters, numbers and hyphens', function () {
    for (const name of ['', 'abc', 'ABC123', 'my-project', '-', 'a-b-c-1']) {
      expect(isShortnameInput(name), name).to.equal(true);
    }
  });

  it('refuses any other character', function () {
    for (const name of ['my_project', 'my project', 'a.b', 'é', 'a/b', '<b>']) {
      expect(isShortnameInput(name), name).to.equal(false);
    }
  });
});
