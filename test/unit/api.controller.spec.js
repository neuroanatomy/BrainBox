const assert = require('assert');
const { assert: chaiAssert } = require('chai');
const sinon = require('sinon');
const fs = require('fs');
require('mocha-sinon');
const apiController = require('../../controller/api/api.controller');

describe('API Controller: ', function () {
  afterEach(function () {
    sinon.restore();
  });

  describe('getLabelsets()', function () {
    it('should return label info from label files', async function () {
      sinon.stub(fs.promises, 'readdir').resolves(['cerebrum.json', 'cerebellum.json']);
      sinon.stub(fs.promises, 'readFile')
        .onFirstCall()
        .resolves(JSON.stringify({ name: 'Cerebrum' }))
        .onSecondCall()
        .resolves(JSON.stringify({ name: 'Cerebellum' }));

      const res = { send: sinon.spy() };
      await apiController.getLabelsets({}, res);

      assert.strictEqual(res.send.callCount, 1);
      const [[result]] = res.send.args;
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].name, 'Cerebrum');
      assert.strictEqual(result[0].source, 'cerebrum.json');
      assert.strictEqual(result[1].name, 'Cerebellum');
      assert.strictEqual(result[1].source, 'cerebellum.json');
    });

    it('should return empty array when no label files exist', async function () {
      sinon.stub(fs.promises, 'readdir').resolves([]);

      const res = { send: sinon.spy() };
      await apiController.getLabelsets({}, res);

      assert.strictEqual(res.send.callCount, 1);
      assert.strictEqual(res.send.args[0][0].length, 0);
    });
  });

  describe('userNameQuery()', function () {
    it('should return 400 when q parameter is missing', function () {
      const sendSpy = sinon.spy();
      const req = { query: {} };
      const res = {
        status: sinon.stub().returns({ send: sendSpy })
      };

      apiController.userNameQuery(req, res);

      assert.strictEqual(res.status.calledWith(400), true);
      assert.strictEqual(sendSpy.callCount, 1);
      chaiAssert.deepEqual(sendSpy.args[0][0], { error: 'missing q parameter' });
    });

    it('should query users and return results', async function () {
      const mockUsers = [
        { name: 'John', nickname: 'john' },
        { name: 'Jane', nickname: 'jane' }
      ];
      const toArrayStub = sinon.stub().resolves(mockUsers);
      const findStub = sinon.stub().returns({ toArray: toArrayStub });
      const collectionStub = sinon.stub().returns({ find: findStub });
      const nativeDbStub = sinon.stub().returns({ collection: collectionStub });

      const req = {
        query: { q: 'j' },
        app: { db: { nativeMongoDB: nativeDbStub } }
      };
      const sendSpy = sinon.spy();
      const res = { send: sendSpy };

      apiController.userNameQuery(req, res);

      // wait for the promise chain to resolve
      await new Promise((resolve) => setTimeout(resolve, 10));

      assert.strictEqual(collectionStub.calledWith('user'), true);
      assert.strictEqual(sendSpy.callCount, 1);
      chaiAssert.deepEqual(sendSpy.args[0][0], mockUsers);
    });

    it('should return 500 on database error', async function () {
      const toArrayStub = sinon.stub().rejects(new Error('DB error'));
      const findStub = sinon.stub().returns({ toArray: toArrayStub });
      const collectionStub = sinon.stub().returns({ find: findStub });
      const nativeDbStub = sinon.stub().returns({ collection: collectionStub });

      const req = {
        query: { q: 'j' },
        app: { db: { nativeMongoDB: nativeDbStub } }
      };
      const statusSendSpy = sinon.spy();
      const res = {
        send: sinon.spy(),
        status: sinon.stub().returns({ send: statusSendSpy })
      };

      apiController.userNameQuery(req, res);

      await new Promise((resolve) => setTimeout(resolve, 10));

      assert.strictEqual(res.status.calledWith(500), true);
      assert.strictEqual(statusSendSpy.callCount, 1);
      chaiAssert.deepEqual(statusSendSpy.args[0][0], { error: 'DB error' });
    });
  });

  describe('getAtlasBackups()', function () {
    it('should return 400 when required params are missing', function () {
      const renderSpy = sinon.spy();
      const req = { query: {} };
      const res = {
        status: sinon.stub().returnsThis(),
        render: renderSpy
      };

      apiController.getAtlasBackups(req, res);

      assert.strictEqual(res.status.calledWith(400), true);
      assert.strictEqual(renderSpy.callCount, 1);
      assert.strictEqual(renderSpy.args[0][0], 'error');
    });

    it('should return 400 when atlas is not found', async function () {
      const findOneStub = sinon.stub().rejects(new Error('not found'));
      const collectionStub = sinon.stub().returns({ findOne: findOneStub });
      const nativeDbStub = sinon.stub().returns({ collection: collectionStub });

      const req = {
        query: { source: 'test.nii.gz', atlasProject: 'proj', atlasName: 'atlas' },
        app: { db: { nativeMongoDB: nativeDbStub } }
      };
      const renderSpy = sinon.spy();
      const res = {
        status: sinon.stub().returnsThis(),
        render: renderSpy
      };

      apiController.getAtlasBackups(req, res);

      await new Promise((resolve) => setTimeout(resolve, 10));

      assert.strictEqual(res.status.calledWith(400), true);
      assert.strictEqual(renderSpy.callCount, 1);
    });
  });

  describe('log()', function () {
    it('should log annotationLength and return cumulative length', async function () {
      const findOneStub = sinon.stub().resolves({ value: { length: 10 } });
      const updateOneStub = sinon.stub().resolves();
      const collectionStub = sinon.stub().returns({
        findOne: findOneStub,
        updateOne: updateOneStub
      });
      const nativeDbStub = sinon.stub().returns({ collection: collectionStub });

      const req = {
        isAuthenticated: () => true,
        user: { username: 'foo' },
        body: {
          key: 'annotationLength',
          value: { source: 'test.nii.gz', atlas: 'atlas.nii.gz', length: 5 }
        },
        app: { db: { nativeMongoDB: nativeDbStub } }
      };
      const sendSpy = sinon.spy();
      const res = {
        send: sendSpy,
        status: sinon.stub().returns({ send: sinon.spy() })
      };

      await apiController.log(req, res);

      assert.strictEqual(sendSpy.callCount, 1);
      chaiAssert.deepEqual(sendSpy.args[0][0], { length: 15 });
    });

    it('should start from 0 when no prior annotationLength exists', async function () {
      const findOneStub = sinon.stub().resolves(null);
      const updateOneStub = sinon.stub().resolves();
      const collectionStub = sinon.stub().returns({
        findOne: findOneStub,
        updateOne: updateOneStub
      });
      const nativeDbStub = sinon.stub().returns({ collection: collectionStub });

      const req = {
        isAuthenticated: () => true,
        user: { username: 'foo' },
        body: {
          key: 'annotationLength',
          value: { source: 'test.nii.gz', atlas: 'atlas.nii.gz', length: 7 }
        },
        app: { db: { nativeMongoDB: nativeDbStub } }
      };
      const sendSpy = sinon.spy();
      const res = {
        send: sendSpy,
        status: sinon.stub().returns({ send: sinon.spy() })
      };

      await apiController.log(req, res);

      assert.strictEqual(sendSpy.callCount, 1);
      chaiAssert.deepEqual(sendSpy.args[0][0], { length: 7 });
    });

    it('should insert a generic log entry for non-annotationLength keys', async function () {
      const insertOneStub = sinon.stub().resolves();
      const updateOneStub = sinon.stub().resolves();
      const collectionStub = sinon.stub().returns({
        insertOne: insertOneStub,
        updateOne: updateOneStub
      });
      const nativeDbStub = sinon.stub().returns({ collection: collectionStub });

      const req = {
        isAuthenticated: () => false,
        body: {
          key: 'someAction',
          value: { source: 'test.nii.gz', atlas: 'atlas.nii.gz' }
        },
        app: { db: { nativeMongoDB: nativeDbStub } },
        headers: { 'x-forwarded-for': '1.2.3.4' },
        connection: { remoteAddress: '127.0.0.1' }
      };
      const sendSpy = sinon.spy();
      const res = {
        send: sendSpy,
        status: sinon.stub().returns({ send: sinon.spy() })
      };

      await apiController.log(req, res);

      assert.strictEqual(insertOneStub.callCount, 1);
      const [[logEntry]] = insertOneStub.args;
      assert.strictEqual(logEntry.key, 'someAction');
      assert.strictEqual(logEntry.username, 'anonymous');
      assert.strictEqual(logEntry.ip, '1.2.3.4');
      assert.strictEqual(sendSpy.callCount, 1);
    });

    it('should return 500 on database error', async function () {
      const collectionStub = sinon.stub().returns({
        findOne: sinon.stub().rejects(new Error('DB failure')),
        updateOne: sinon.stub().resolves()
      });
      const nativeDbStub = sinon.stub().returns({ collection: collectionStub });

      const req = {
        isAuthenticated: () => true,
        user: { username: 'foo' },
        body: {
          key: 'annotationLength',
          value: { source: 'test.nii.gz', atlas: 'atlas.nii.gz', length: 5 }
        },
        app: { db: { nativeMongoDB: nativeDbStub } }
      };
      const statusSendSpy = sinon.spy();
      const res = {
        send: sinon.spy(),
        status: sinon.stub().returns({ send: statusSendSpy })
      };

      await apiController.log(req, res);

      assert.strictEqual(res.status.calledWith(500), true);
      assert.strictEqual(statusSendSpy.callCount, 1);
    });
  });
});
