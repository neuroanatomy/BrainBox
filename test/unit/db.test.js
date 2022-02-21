var chai = require('chai');
var {assert} = chai;
const U = require('../utils.js');

describe('UNIT TESTING DATABASE', function () {
  let db;
  before(function () {
    db = U.getDB();
  });

  describe('Query user', function () {
    it('should return user object if present', async function () {
      const res = await db.get('user').findOne({nickname: U.userFoo.nickname});
      const expectedKeys = ['_id', 'name', 'nickname', 'url', 'brainboxURL', 'avatarURL', 'joined'];
      assert.hasAllKeys(res, expectedKeys);
    });

    it('should not return user object if not present', async function () {
      const res = await db.get('user').findOne({nickname: 'nonexisting'});
      assert.isNull(res);
    });
  });
});
