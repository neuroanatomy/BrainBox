/* eslint-disable max-lines */
const assert = require('assert');
const userController = require('../../controller/user/user.controller');
require('mocha-sinon');
const sinon = require('sinon');
const httpMocks = require('node-mocks-http');
// const { expect, use } = require("chai");
// const { doesNotMatch, fail } = require("assert");
const U = require('../utils');

describe('User Controller: ', function () {
  let db, nativeDb;

  before(function () {
    db = U.getDB();
    nativeDb = U.getNativeDB();
  });

  describe('validator function() ', function () {
    it('should perform the validations correctly', async function () {
      // currently the validation function does nothing
      const req = httpMocks.createRequest();
      const res = httpMocks.createResponse();
      await userController.validator(req, res, () => { /* do nothing */ });
      assert.strictEqual(res.statusCode, 200);
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
        db,
        nativeDb,
        query: {},
        isAuthenticated: function () {
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
      const userInfo = JSON.parse(res.render.args[0][1].userInfo);
      assert.ok(!userInfo._id, 'Rendered user data must not include _id');
      sinon.restore();
    });

    it('should throw no user message when the input is invalid', async function () {
      const req = {
        user: {
          username: 'anyone'
        },
        params: {
          userName: 'some random user'
        },
        session: {},
        originalUrl: 'some url',
        db,
        nativeDb,
        query: {},
        isAuthenticated: function () {
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

  describe('apiUser function() ', function () {
    it('should work correctly when the input is valid.', async function () {
      const req = {
        params: {
          userName: 'anyone'
        },
        query: {},
        db: db,
        nativeDb: nativeDb
      };
      const res = {
        send: sinon.spy()
      };
      await userController.apiUser(req, res);
      assert.strictEqual(res.send.callCount, 1);
      assert.ok(!res.send.args[0][0]._id, 'API response must not include _id');
      sinon.restore();
    });
  });

  // eslint-disable-next-line max-statements
  describe('user documents only leave the server through the allow-list (T004)', function () {
    const PUBLIC_FIELDS = ['nickname', 'name', 'avatarURL', 'url', 'joined'];
    const secretHash = '$2b$10$UNIT.TEST.PASSHASH.must.never.leave.the.server';
    const localUser = {
      strategy: 'local',
      nickname: 'unit-local-user',
      name: 'Unit Local',
      url: 'https://unit.example',
      brainboxURL: '/user/unit-local-user',
      avatarURL: 'https://unit.example/a.png',
      joined: '2026-10-12T00:00:00.000Z',
      passhash: secretHash,
      email: 'unit-local@example.org'
    };
    const makeReq = (userName, extra) => ({
      params: { userName },
      session: {},
      originalUrl: '/user/' + userName,
      db,
      nativeDb,
      query: {},
      ...extra
    });
    const makeRes = () => {
      const res = { render: sinon.spy(), send: sinon.spy() };
      res.status = sinon.stub().returns(res);

      return res;
    };
    const failingDb = {
      collection: () => ({ findOne: () => Promise.reject(new Error('simulated DB failure')) })
    };
    const apiUserVar = async (v) => {
      const res = makeRes();
      await userController.apiUser(makeReq(localUser.nickname, { query: { var: v } }), res);

      return res.send.args;
    };
    const renderContext = async (userName, extra) => {
      const res = makeRes();
      await userController.user(makeReq(userName, extra), res);
      assert.strictEqual(res.render.callCount, 1);

      return res.render.args[0][1];
    };

    before(async function () {
      await U.insertUser({ ...localUser });
    });

    after(async function () {
      await U.removeUser(localUser.nickname);
    });

    it('apiUser sends only the public fields, never the passhash', async function () {
      const res = makeRes();
      await userController.apiUser(makeReq(localUser.nickname), res);
      assert.strictEqual(res.send.callCount, 1);
      const [[sent]] = res.send.args;
      assert.deepStrictEqual(Object.keys(sent).sort(), [...PUBLIC_FIELDS].sort());
      assert.strictEqual(sent.name, localUser.name);
      assert.ok(!JSON.stringify(sent).includes(secretHash));
    });

    it('apiUser ?var= only reaches the public fields', async function () {
      const privateVars = ['passhash', 'email', 'strategy', '_id', 'name/constructor'];
      const sent = await Promise.all(privateVars.map(apiUserVar));
      sent.forEach((args, i) => {
        assert.deepStrictEqual(args, [[null]], `?var=${privateVars[i]} must send nothing`);
      });
      assert.deepStrictEqual(await apiUserVar('name'), [[localUser.name]]);
    });

    it('apiUser answers 500 instead of rejecting when the DB fails', async function () {
      const res = makeRes();
      await userController.apiUser(makeReq('x', { nativeDb: failingDb }), res);
      assert.ok(res.status.calledWith(500));
      assert.strictEqual(res.send.callCount, 1);
    });

    it('the user page embeds only the public fields of the requested user', async function () {
      const context = await renderContext(localUser.nickname, { user: null });
      const userInfo = JSON.parse(context.userInfo);
      assert.deepStrictEqual(Object.keys(userInfo).sort(), [...PUBLIC_FIELDS].sort());
      assert.ok(!context.userInfo.includes(secretHash));
      assert.ok(!context.userInfo.includes(localUser.email));
    });

    it('the user page embeds only the username and public fields of the logged user', async function () {
      const sessionUser = { ...localUser, username: localUser.nickname, _id: 'abc' };
      const { loggedUser } = await renderContext(localUser.nickname, { user: sessionUser });
      assert.ok(!loggedUser.includes(secretHash));
      const parsed = JSON.parse(loggedUser);
      assert.strictEqual(parsed.username, localUser.nickname);
      assert.deepStrictEqual(Object.keys(parsed).sort(), ['username', ...PUBLIC_FIELDS].sort());
    });

    it('the user page renders loggedUser as null for anonymous visitors', async function () {
      const { loggedUser } = await renderContext(localUser.nickname, {});
      assert.strictEqual(loggedUser, 'null');
    });

    it('the user page cannot be broken out of by a user name', async function () {
      const nickname = 'unit-quote-user';
      const name = 'O\'Brien &quot; </script> <b>';
      await U.insertUser({ nickname, name });
      try {
        const { userInfo } = await renderContext(nickname, {});
        assert.ok(!(/['&<>]/).test(userInfo), userInfo);
        assert.strictEqual(JSON.parse(userInfo).name, name);
      } finally {
        await U.removeUser(nickname);
      }
    });

    it('the user page answers 500 instead of rejecting when the DB fails', async function () {
      const res = makeRes();
      await userController.user(makeReq('x', { nativeDb: failingDb }), res);
      assert.ok(res.status.calledWith(500));
      assert.strictEqual(res.send.callCount, 1);
      assert.strictEqual(res.render.callCount, 0);
    });
  });

  describe('apiUserAll function() ', function () {
    it('should ask for page parameter if not provided', async function () {
      const req = {
        db,
        nativeDb,
        query: {}
      };
      const res = {
        json: sinon.spy(),
        send: sinon.spy()
      };
      await userController.apiUserAll(req, res);
      assert.strictEqual(res.json.callCount, 1);
      assert.notStrictEqual(res.json.args, [{ error: 'Provide the parameter \'page\'' }]);
      sinon.restore();
    });

    it('should send the data correctly when the input is valid', async function () {
      const req = {
        db,
        nativeDb,
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

  describe('apiUserFiles function() ', function () {
    it('should ask for start parameter if not provided', async function () {
      const req = {
        db,
        nativeDb,
        params: {
          userName: 'foo'
        },
        query: {
          length: 3
        },
        user: {
          username: 'anyone'
        },
        isAuthenticated: function () {
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
      assert.notStrictEqual(sendSpy.args, [{ error: 'Provide \'start\'' }]);
      sinon.restore();
    });

    it('should ask for length parameter if not provided', async function () {
      const req = {
        db,
        nativeDb,
        params: {
          userName: 'foo'
        },
        query: {
          start: 1
        },
        user: {
          username: 'anyone'
        },
        isAuthenticated: function () {
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
      assert.notStrictEqual(sendSpy.args, [{ error: 'Provide \'length\'' }]);
      sinon.restore();
    });

    it('should send the data correctly with correct input', async function () {
      const req = {
        db,
        nativeDb,
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
        isAuthenticated: function () {
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

  describe('apiUserAtlas function() ', function () {
    it('should ask for start parameter if not provided', async function () {
      const req = {
        db,
        nativeDb,
        params: {
          userName: 'foo'
        },
        query: {
          length: 3
        },
        user: {
          username: 'anyone'
        },
        isAuthenticated: function () {
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
      assert.notStrictEqual(sendSpy.args, [{ error: 'Provide \'start\'' }]);
      sinon.restore();
    });

    it('should ask for length parameter if not provided', async function () {
      const req = {
        db,
        nativeDb,
        params: {
          userName: 'foo'
        },
        query: {
          start: 1
        },
        user: {
          username: 'anyone'
        },
        isAuthenticated: function () {
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
      assert.notStrictEqual(sendSpy.args, [{ error: 'Provide \'length\'' }]);
      sinon.restore();
    });

    it('should send the data correctly with valid input', async function () {
      const req = {
        db,
        nativeDb,
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
        isAuthenticated: function () {
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

  describe('apiUserProjects function() ', function () {
    it('should ask for start parameter if not provided', async function () {
      const req = {
        db,
        nativeDb,
        params: {
          userName: 'foo'
        },
        query: {
          length: 3
        },
        user: {
          username: 'anyone'
        },
        isAuthenticated: function () {
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
      assert.notStrictEqual(sendSpy.args, [{ error: 'Provide \'start\'' }]);
      sinon.restore();
    });

    it('should ask for length parameter if not provided', async function () {
      const req = {
        db,
        nativeDb,
        params: {
          userName: 'foo'
        },
        query: {
          start: 1
        },
        user: {
          username: 'anyone'
        },
        isAuthenticated: function () {
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
      assert.notStrictEqual(sendSpy.args, [{ error: 'Provide \'length\'' }]);
      sinon.restore();
    });

    it('should return the data correctly with valid input', async function () {
      const req = {
        db,
        nativeDb,
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
        isAuthenticated: function () {
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
