const assert = require('assert');
const adminController = require('../../controller/admin/admin.controller');
const admins = require('../../controller/admin/admins');
require('mocha-sinon');
const sinon = require('sinon');


// requests for the validator
const validatorResStub = () => {
  const res = {};
  res.status = sinon.stub().returns(res);
  res.send = sinon.stub().returns(res);
  res.end = sinon.stub().returns(res);

  return res;
};
// what Apache's mod_proxy sends: it connects over loopback and adds X-Forwarded-For
const viaProxy = (user, peer = '::1') => ({
  user,
  method: 'POST',
  originalUrl: '/admin/broadcast-message',
  headers: { 'x-forwarded-for': '203.0.113.7', 'x-forwarded-host': 'brainbox.pasteur.fr' },
  socket: { remoteAddress: peer }
});
const direct = (peer, headers = {}) => ({
  method: 'POST',
  originalUrl: '/admin/save-all-atlases',
  headers,
  socket: { remoteAddress: peer }
});
const runValidator = (req) => {
  const res = validatorResStub();
  const next = sinon.spy();
  adminController.validator(req, res, next);

  return { res, next };
};
const assertRefused = ({ res, next }) => {
  assert.strictEqual(next.callCount, 0);
  assert.strictEqual(res.status.firstCall.args[0], 403);
  assert.deepStrictEqual(res.send.firstCall.args[0], { error: 'Unauthorized address' });
};
const assertPassed = ({ res, next }) => {
  assert.strictEqual(next.callCount, 1);
  assert.strictEqual(res.status.callCount, 0);
};

describe('Admin Controller: ', function() {
  describe('Validator function() ', function() {
    let previousAdmins;

    before(function () {
      previousAdmins = admins.getAdmins();
      admins.setAdmins(['admin1']);
      sinon.stub(console, 'log');
    });

    after(function () {
      admins.setAdmins(previousAdmins);
      sinon.restore();
    });

    it('refuses anonymous visitors coming through the proxy over ::1', function () {
      assertRefused(runValidator(viaProxy()));
    });

    it('refuses anonymous visitors coming through the proxy over 127.0.0.1', function () {
      assertRefused(runValidator(viaProxy(null, '127.0.0.1')));
      assertRefused(runValidator(viaProxy(null, '::ffff:127.0.0.1')));
    });

    it('refuses logged-in users who are not admins, through the proxy', function () {
      assertRefused(runValidator(viaProxy({ username: 'someone' })));
    });

    it('lets admins through, through the proxy', function () {
      assertPassed(runValidator(viaProxy({ username: 'admin1' })));
    });

    it('lets through scripts calling the app directly on the server', function () {
      assertPassed(runValidator(direct('::1')));
      assertPassed(runValidator(direct('127.0.0.1')));
      assertPassed(runValidator(direct('::ffff:127.0.0.1')));
    });

    it('refuses a local request with any forwarding header', function () {
      assertRefused(runValidator(direct('::1', { 'x-forwarded-for': '127.0.0.1' })));
      assertRefused(runValidator(direct('::1', { forwarded: 'for=203.0.113.7' })));
      assertRefused(runValidator(direct('127.0.0.1', { 'x-forwarded-host': 'brainbox.pasteur.fr' })));
    });

    it('refuses remote peers, whose address only ends like a loopback one', function () {
      assertRefused(runValidator(direct('203.0.113.7')));
      assertRefused(runValidator(direct('2001:db8::1')));
      assertRefused(runValidator(direct('fe80::1')));
      assertRefused(runValidator(direct('::ffff:10.0.0.1')));
      assertRefused(runValidator(direct('10.127.0.0.1')));
    });

    it('refuses a request without a peer address', function () {
      assertRefused(runValidator({ headers: {}, socket: {} }));
    });

    it('logs refused attempts', function () {
      console.log.resetHistory();
      runValidator(viaProxy({ username: 'someone' }));
      assert.strictEqual(console.log.callCount, 1);
      assert.match(console.log.firstCall.args.join(' '), /admin: refused/);
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
