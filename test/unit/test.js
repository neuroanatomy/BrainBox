var chai = require("chai");
var assert = chai.assert;
const U = require('../utils.js');

const datadir = './test/data/';


describe('UNIT TEST TRIVIAL CHECK', () => {
  describe('#indexOf()', () => {
    it('should return -1 when the value is not present', () => {
      assert.equal(-1, [1, 2, 3].indexOf(4)); // 4 is not present in this array so indexOf returns -1
    });
  });
});
