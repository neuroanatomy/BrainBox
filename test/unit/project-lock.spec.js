const assert = require('assert');
const lock = require('../../controller/projectLock');
const projectController = require('../../controller/project/project.controller');
const U = require('../utils.js');

// T002 M11c: the lock that serialises the changes to projects (project saves and deletes, the
// admin fixes), all holding ['project', 'mri']. The timings come from promises the tests resolve.

const keys = ['project', 'mri'];

// A promise, and the function that resolves it
const gate = () => {
  let open;
  const promise = new Promise((resolve) => { open = resolve; });

  return { promise, open };
};

// Lets every pending promise callback run
const flush = () => new Promise((resolve) => { setImmediate(resolve); });

describe('Project lock (M11c)', function () {
  describe('the module', function () {
    it('runs two holders of [\'project\', \'mri\'] one at a time, in call order', async function () {
      const order = [];
      const first = gate();
      const a = lock.acquire(keys, async () => {
        order.push('a in');
        await first.promise;
        order.push('a out');
      });
      const b = lock.acquire(keys, () => {
        order.push('b in');
        order.push('b out');
      });
      await flush();
      assert.deepStrictEqual(order, ['a in']);
      first.open();
      await Promise.all([a, b]);
      assert.deepStrictEqual(order, ['a in', 'a out', 'b in', 'b out']);
    });

    it('rejects with the error of a throwing holder, and the next holder still runs', async function () {
      const thrown = lock.acquire(keys, async () => {
        await flush();
        throw new Error('boom');
      });
      const next = lock.acquire(keys, () => 'next');
      await assert.rejects(thrown, { message: 'boom' });
      assert.strictEqual(await next, 'next');
    });

    it('resolves with what the holder returns', async function () {
      assert.deepStrictEqual(await lock.acquire(keys, () => Promise.resolve({ value: 42 })), { value: 42 });
      assert.strictEqual(await lock.acquire(keys, () => 'sync'), 'sync');
    });
  });

  describe('a project delete, through the controller', function () {
    const shortname = 'm11c-lock';
    const owner = 'm11c-owner';
    let nativeDb;

    before(async function () {
      nativeDb = U.getNativeDB();
      await nativeDb.collection('project').insertOne({
        name: 'M11c lock',
        shortname,
        url: '',
        owner,
        collaborators: { list: [] },
        files: { list: [] },
        annotations: { list: [] }
      });
    });

    after(async function () {
      await nativeDb.collection('project').deleteMany({ shortname });
    });

    // eslint-disable-next-line max-statements
    it('does not touch the database while the lock is held, and deletes the project once released', async function () {
      const held = gate();
      const holder = lock.acquire(keys, () => held.promise);

      // the delete's database, which records whether it was used while the test held the lock
      let holding = true;
      let usedWhileHeld = false;
      const db = new Proxy(nativeDb, {
        get(target, prop) {
          if (prop === 'collection' && holding) {
            usedWhileHeld = true;
          }
          const value = Reflect.get(target, prop);

          return typeof value === 'function' ? value.bind(target) : value;
        }
      });
      const answered = gate();
      const req = {
        user: { username: owner },
        params: { projectName: shortname },
        isAuthenticated: () => true,
        nativeDb: db
      };
      const res = {
        json: (body) => answered.open(body),
        status: () => res
      };
      const deletion = projectController.deleteProject(req, res);

      // a round trip to the database, after which an unlocked delete would have started
      await flush();
      const during = await nativeDb.collection('project').findOne({ shortname, backup: { $exists: false } });
      assert.ok(during, 'the project is still there while the lock is held');
      assert.strictEqual(during.name, 'M11c lock');
      assert.strictEqual(usedWhileHeld, false, 'the delete waited for the lock');

      holding = false;
      held.open();
      await holder;
      await deletion;
      assert.deepStrictEqual(await answered.promise, { success: true, message: 'Project deleted' });
      assert.strictEqual(await nativeDb.collection('project').findOne({ shortname, backup: { $exists: false } }), null);
    });
  });
});
