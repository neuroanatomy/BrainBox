const chai = require('chai');
const { assert } = chai;


describe('UNIT TEST TRIVIAL CHECK', function () {
  describe('#indexOf()', function () {
    it('should return -1 when the value is not present', function () {
      assert.equal(-1, [1, 2, 3].indexOf(4)); // 4 is not present in this array so indexOf returns -1
    });
  });
});
