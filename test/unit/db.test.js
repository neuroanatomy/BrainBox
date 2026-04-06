const chai = require('chai');
const {assert} = chai;
const U = require('../utils.js');

describe('UNIT TESTING DATABASE', function () {
  // let db; // monk
  let nativeDb; // native mongodb
  before(function () {
    // db = U.getDB();
    nativeDb = U.getNativeDB();
  });

  describe('Query user', function () {
    it('should return user object if present', async function () {
      const res = await nativeDb.collection('user').findOne({ nickname: U.userFoo.nickname});
      const expectedKeys = ['_id', 'name', 'nickname', 'url', 'brainboxURL', 'avatarURL', 'joined'];
      assert.hasAllKeys(res, expectedKeys);
    });

    it('should not return user object if not present', async function () {
      const res = await nativeDb.collection('user').findOne({ nickname: 'nonexisting'});
      assert.isNull(res);
    });
  });
});
