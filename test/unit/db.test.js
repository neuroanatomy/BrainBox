var chai = require("chai");
var assert = chai.assert;
const monk = require('monk');
const db = monk('localhost:27017/brainbox');
const U = require('../utils.js');

describe('UNIT TESTING DATABASE', function () {
  describe('Query user', function () {
    it('should return user object if present', async function () {
      const res = await db.get('user').findOne({nickname: U.userFoo.nickname});
      const expectedKeys = ["_id", "name", "nickname", "url", "brainboxURL", "avatarURL", "joined"];
      assert.hasAllKeys(res, expectedKeys);
    });

    it('should not return user object if not present', async function () {
      const res = await db.get('user').findOne({nickname: "nonexisting"});
      assert.isNull(res);
    });
  });
});
