const assert = require('assert');
const adminController = require('../../controller/admin/admin.controller');
const admins = require('../../controller/admin/admins');
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

  describe('Admins', function () {
    let previousAdmins;
    const resStub = () => {
      const res = {};
      res.status = sinon.stub().returns(res);
      res.json = sinon.stub().returns(res);

      return res;
    };

    before(function () {
      previousAdmins = admins.getAdmins();
      admins.setAdmins(['admin1', 'admin2']);
    });

    after(function () {
      admins.setAdmins(previousAdmins);
    });

    it('isAdmin should only accept usernames in the list', function () {
      assert.strictEqual(admins.isAdmin('admin1'), true);
      assert.strictEqual(admins.isAdmin('someone'), false);
      assert.strictEqual(admins.isAdmin(''), false);
      assert.strictEqual(admins.isAdmin(null), false);
      // eslint-disable-next-line no-undefined
      assert.strictEqual(admins.isAdmin(undefined), false);
    });

    it('validator should let admins through from any address', function () {
      const req = { user: { username: 'admin2' }, connection: { remoteAddress: '10.0.0.1' } };
      const next = sinon.spy();
      adminController.validator(req, resStub(), next);
      assert.strictEqual(next.callCount, 1);
    });

    it('requireAdmin should answer 401 to anonymous users', function () {
      const res = resStub();
      const next = sinon.spy();
      adminController.requireAdmin({}, res, next);
      assert.strictEqual(next.callCount, 0);
      assert.strictEqual(res.status.firstCall.args[0], 401);
    });

    it('requireAdmin should answer 403 to users who are not admins', function () {
      const res = resStub();
      const next = sinon.spy();
      adminController.requireAdmin({ user: { username: 'someone' } }, res, next);
      assert.strictEqual(next.callCount, 0);
      assert.strictEqual(res.status.firstCall.args[0], 403);
    });

    it('requireAdmin should let admins through', function () {
      const next = sinon.spy();
      adminController.requireAdmin({ user: { username: 'admin1' } }, resStub(), next);
      assert.strictEqual(next.callCount, 1);
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
