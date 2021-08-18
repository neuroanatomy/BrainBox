/* eslint-disable prefer-exponentiation-operator */
var assert = require("assert");
const userController = require('../../controller/user/user.controller');
const monk = require('monk');
require('mocha-sinon');
const sinon = require('sinon');
const db = monk('localhost:27017/brainbox');

describe('User Controller: ', function () {
  describe('validator function() ', function () {
    it('should perform the validations correctly', async function () {
      const req = {};
      const res = {
        send: sinon.spy()
      };
      // eslint-disable-next-line no-empty-function
      await userController.validator(req, res, () => { });
      assert.strictEqual(res.send.callCount, 0);
      sinon.restore();
    });
  });

  describe('user function() ', function () {
    it('should return the requested user with valid input', async function () {
      const req = {
        user: {
          username: 'anyone'
        },
        params: {
          userName: 'foo'
        },
        session: {},
        originalUrl: 'some url',
        db: db,
        query: {},
        isAuthenticated: function() {
          return Boolean(this.user.username);
        }
      };
      const failure = sinon.spy();
      const res = {
        render: sinon.spy(),
        status: sinon.stub().returns({ send: failure })
      };
      await userController.user(req, res);
      assert.strictEqual(res.render.callCount, 1);
      sinon.restore();
    });

    it('should throw no user message when the input is invalid', async function() {
      const req = {
        user: {
          username: 'anyone'
        },
        params: {
          userName: 'some random user'
        },
        session: {},
        originalUrl: 'some url',
        db: db,
        query: {},
        isAuthenticated: function() {
          return Boolean(this.user.username);
        }
      };
      const failure = sinon.spy();
      const res = {
        render: sinon.spy(),
        status: sinon.stub().returns({ send: failure })
      };
      await userController.user(req, res);
      assert.strictEqual(failure.callCount, 1);
      sinon.restore();
    });
  });

  describe('apiUser function() ', function() {
    it('should work correctly when the input is valid.', async function() {
      const req = {
        params: {
          userName: 'anyone'
        },
        query: {},
        db: db
      };
      const res = {
        send: sinon.spy()
      };
      await userController.apiUser(req, res);
      assert.strictEqual(res.send.callCount, 1);
      sinon.restore();
    });
  });

  describe('apiUserAll function() ', function() {
    it('should ask for page parameter if not provided', async function() {
      const req = {
        db: db,
        query: {}
      };
      const res = {
        json: sinon.spy(),
        send: sinon.spy()
      };
      await userController.apiUserAll(req, res);
      assert.strictEqual(res.json.callCount, 1);
      assert.notStrictEqual(res.json.args, [{ error: "Provide the parameter 'page'" }]);
      sinon.restore();
    });

    it('should send the data correctly when the input is valid', async function() {
      const req = {
        db: db,
        query: {
          page: 2
        }
      };
      const res = {
        json: sinon.spy(),
        send: sinon.spy()
      };
      await userController.apiUserAll(req, res);
      assert.strictEqual(res.json.callCount, 0);
      assert.strictEqual(res.send.callCount, 1);
      sinon.restore();
    });
  });

  describe('apiUserFiles function() ', function() {
    it('should ask for start parameter if not provided', async function() {
      const req = {
        db: db,
        params: {
          userName: 'foo'
        },
        query: {
          length: 3
        },
        user: {
          username: 'anyone'
        },
        isAuthenticated: function() {
          return Boolean(this.user.username);
        }
      };
      const sendSpy = sinon.spy();
      const res = {
        status: sinon.stub().returns({ send: sendSpy }),
        send: sendSpy
      };
      await userController.apiUserFiles(req, res);
      assert.strictEqual(sendSpy.callCount, 1);
      assert.notStrictEqual(sendSpy.args, [{ error: "Provide 'start'" }]);
      sinon.restore();
    });

    it('should ask for length parameter if not provided', async function() {
      const req = {
        db: db,
        params: {
          userName: 'foo'
        },
        query: {
          start: 1
        },
        user: {
          username: 'anyone'
        },
        isAuthenticated: function() {
          return Boolean(this.user.username);
        }
      };
      const sendSpy = sinon.spy();
      const res = {
        status: sinon.stub().returns({ send: sendSpy }),
        send: sendSpy
      };
      await userController.apiUserFiles(req, res);
      assert.strictEqual(sendSpy.callCount, 1);
      assert.notStrictEqual(sendSpy.args, [{ error: "Provide 'length'" }]);
      sinon.restore();
    });

    it('should send the data correctly with correct input', async function() {
      const req = {
        db: db,
        params: {
          userName: 'foo'
        },
        query: {
          start: 1,
          length: 3
        },
        user: {
          username: 'anyone'
        },
        isAuthenticated: function() {
          return Boolean(this.user.username);
        }
      };
      const sendSpy = sinon.spy();
      const res = {
        status: sinon.stub().returns({ send: sendSpy }),
        send: sendSpy
      };
      await userController.apiUserFiles(req, res);
      assert.strictEqual(sendSpy.callCount, 1);
      assert.strictEqual(sendSpy.args[0][0].success, true);
      sinon.restore();
    });
  });

  describe('apiUserAtlas function() ', function() {
    it('should ask for start parameter if not provided', async function() {
      const req = {
        db: db,
        params: {
          userName: 'foo'
        },
        query: {
          length: 3
        },
        user: {
          username: 'anyone'
        },
        isAuthenticated: function() {
          return Boolean(this.user.username);
        }
      };
      const sendSpy = sinon.spy();
      const res = {
        status: sinon.stub().returns({ send: sendSpy }),
        send: sendSpy
      };
      await userController.apiUserAtlas(req, res);
      assert.strictEqual(sendSpy.callCount, 1);
      assert.notStrictEqual(sendSpy.args, [{ error: "Provide 'start'" }]);
      sinon.restore();
    });

    it('should ask for length parameter if not provided', async function() {
      const req = {
        db: db,
        params: {
          userName: 'foo'
        },
        query: {
          start: 1
        },
        user: {
          username: 'anyone'
        },
        isAuthenticated: function() {
          return Boolean(this.user.username);
        }
      };
      const sendSpy = sinon.spy();
      const res = {
        status: sinon.stub().returns({ send: sendSpy }),
        send: sendSpy
      };
      await userController.apiUserAtlas(req, res);
      assert.strictEqual(sendSpy.callCount, 1);
      assert.notStrictEqual(sendSpy.args, [{ error: "Provide 'length'" }]);
      sinon.restore();
    });

    it('should send the data correctly with valid input', async function() {
      const req = {
        db: db,
        params: {
          userName: 'foo'
        },
        query: {
          start: 1,
          length: 3
        },
        user: {
          username: 'anyone'
        },
        isAuthenticated: function() {
          return Boolean(this.user.username);
        }
      };
      const sendSpy = sinon.spy();
      const res = {
        status: sinon.stub().returns({ send: sendSpy }),
        send: sendSpy
      };
      await userController.apiUserFiles(req, res);
      assert.strictEqual(sendSpy.callCount, 1);
      assert.strictEqual(sendSpy.args[0][0].success, true);
      sinon.restore();
    });
  });

  describe('apiUserProjects function() ', function() {
    it('should ask for start parameter if not provided', async function() {
      const req = {
        db: db,
        params: {
          userName: 'foo'
        },
        query: {
          length: 3
        },
        user: {
          username: 'anyone'
        },
        isAuthenticated: function() {
          return Boolean(this.user.username);
        }
      };
      const sendSpy = sinon.spy();
      const res = {
        status: sinon.stub().returns({ send: sendSpy }),
        send: sendSpy
      };
      await userController.apiUserProjects(req, res);
      assert.strictEqual(sendSpy.callCount, 1);
      assert.notStrictEqual(sendSpy.args, [{ error: "Provide 'start'" }]);
      sinon.restore();
    });

    it('should ask for length parameter if not provided', async function() {
      const req = {
        db: db,
        params: {
          userName: 'foo'
        },
        query: {
          start: 1
        },
        user: {
          username: 'anyone'
        },
        isAuthenticated: function() {
          return Boolean(this.user.username);
        }
      };
      const sendSpy = sinon.spy();
      const res = {
        status: sinon.stub().returns({ send: sendSpy }),
        send: sendSpy
      };
      await userController.apiUserProjects(req, res);
      assert.strictEqual(sendSpy.callCount, 1);
      assert.notStrictEqual(sendSpy.args, [{ error: "Provide 'length'" }]);
      sinon.restore();
    });

    it('should return the data correctly with valid input', async function() {
      const req = {
        db: db,
        params: {
          userName: 'foo'
        },
        query: {
          start: 1,
          length: 3
        },
        user: {
          username: 'anyone'
        },
        isAuthenticated: function() {
          return Boolean(this.user.username);
        }
      };
      const sendSpy = sinon.spy();
      const res = {
        status: sinon.stub().returns({ send: sendSpy }),
        send: sendSpy
      };
      await userController.apiUserFiles(req, res);
      assert.strictEqual(sendSpy.callCount, 1);
      assert.strictEqual(sendSpy.args[0][0].success, true);
      sinon.restore();
    });
  });
});
