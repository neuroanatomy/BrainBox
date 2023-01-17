const assert = require('assert');
const adminController = require('../../controller/admin/admin.controller');
require('mocha-sinon');
const sinon = require('sinon');


describe('Admin Controller: ', function() {
  describe('Validator function() ', function() {
    it('should throw error with unauthorized address', async function() {
      const req = {
        connection: {
          remoteAddress: 'localhost:8080'
        }
      };
      const resSpy = sinon.spy();
      const res = {
        status: sinon.stub().returns({ send: sinon.stub().returns({ end: resSpy })})
      };
      // eslint-disable-next-line no-empty-function
      await adminController.validator(req, res, () => {});
      assert.strictEqual(resSpy.callCount, 1);
      sinon.restore();
    });

    it('should pass successfully with correct address', async function() {
      const req = {
        connection: {
          remoteAddress: '127.0.0.1:1'
        }
      };
      const resSpy = sinon.spy();
      const res = {
        status: sinon.stub().returns({ send: sinon.stub().returns({ end: resSpy })})
      };
      // eslint-disable-next-line no-empty-function
      await adminController.validator(req, res, () => {});
      assert.strictEqual(resSpy.callCount, 0);
      sinon.restore();
    });
  });

  describe('saveAllAtlases function() ', function() {
    it('should work correctly', async function() {
      const req = {};
      const res = {
        send: sinon.spy()
      };
      await adminController.saveAllAtlases(req, res);
      assert.strictEqual(res.send.callCount, 1);
      assert.notStrictEqual(res.send.args, [[{ msg: 'Will save all atlases', success: true }]]);
      sinon.restore();
    });
  });

  describe('broadcastMessage function() ', function () {
    it('should throw error if validation fails', async function() {
      const reqSpy = sinon.spy();
      const req = {
        body: {
        },
        checkBody: sinon.stub().returns({ notEmpty: reqSpy }),
        validationErrors: function () {
          if(!this.body.msg || this.body.msg === '') { return 'Msg should not be empty'; }

          return null;
        }
      };
      const endSpy = sinon.spy();
      const res = {
        status: sinon.stub().returns({ send: sinon.stub().returns({ end: endSpy })}),
        send: sinon.spy()
      };
      await adminController.broadcastMessage(req, res);
      assert.strictEqual(endSpy.callCount, 1);
      sinon.restore();
    });

    it('should work correctly with valid input', async function() {
      const reqSpy = sinon.spy();
      const req = {
        body: {
          msg: 'Testing'
        },
        checkBody: sinon.stub().returns({ notEmpty: reqSpy }),
        validationErrors: function () {
          if(!this.body.msg || this.body.msg === '') { return 'Msg should not be empty'; }

          return null;
        }
      };
      const endSpy = sinon.spy();
      const res = {
        status: sinon.stub().returns({ send: sinon.stub().returns({ end: endSpy })}),
        send: sinon.spy()
      };
      await adminController.broadcastMessage(req, res);
      assert.notStrictEqual(res.send.args, [[{ msg: 'Will broadcast message Testing', success: true }]]);
      assert.strictEqual(res.send.callCount, 1);
      sinon.restore();
    });
  });
});
