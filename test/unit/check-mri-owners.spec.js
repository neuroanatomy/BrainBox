'use strict';

const { assert } = require('chai');
const U = require('../utils.js');
const { checkMriOwners, ownerKind } = require('../../bin/check-mri-owners.js');

const PREFIX = 'https://example.org/check-mri-owners/';
const USERS = ['checkowners-alice', '198.51.100.9'];
const mri = (name, owner, backup = false) => ({
  source: PREFIX + name,
  name,
  ...(typeof owner === 'undefined' ? {} : { owner }),
  ...(backup ? { backup: true } : {})
});

describe('UNIT TESTING bin/check-mri-owners.js', function () {
  let nativeDb;

  const cleanUp = async () => {
    await nativeDb.collection('mri').deleteMany({ source: { $regex: '^' + PREFIX } });
    await nativeDb.collection('user').deleteMany({ nickname: { $in: USERS } });
  };

  before(async function () {
    nativeDb = U.getNativeDB();
    await cleanUp();
    await nativeDb.collection('user').insertMany(USERS.map((nickname) => ({ nickname, name: nickname })));
    await nativeDb.collection('mri').insertMany([
      mri('user', 'checkowners-alice'),
      mri('ip', 'ip:203.0.113.7'),
      mri('address', '203.0.113.7'),
      mri('address6', '::ffff:127.0.0.1'),
      mri('forwarded', '203.0.113.7, 198.51.100.1'),
      mri('forged', 'checkowners-alice, 198.51.100.1'),
      mri('none', 'anonymous'),
      mri('missing'),
      mri('unknown', 'checkowners-deleted'),
      mri('address-user', '198.51.100.9'),
      // backups are not checked
      mri('user', 'checkowners-forged', true)
    ]);
  });

  after(async function () {
    await cleanUp();
  });

  it('tells the kinds of owners apart', function () {
    const usernames = new Set(['alice', '198.51.100.9']);
    assert.strictEqual(ownerKind('alice', usernames), 'user');
    assert.strictEqual(ownerKind('ip:2001:db8::1', usernames), 'ip');
    assert.strictEqual(ownerKind('2001:db8::1', usernames), 'address');
    assert.strictEqual(ownerKind('198.51.100.9', usernames), 'address');
    assert.strictEqual(ownerKind('10.0.0.1, 2001:db8::1', usernames), 'forwarded');
    assert.strictEqual(ownerKind('alice, 10.0.0.1', usernames), 'forged');
    assert.strictEqual(ownerKind('', usernames), 'none');
    assert.strictEqual(ownerKind(null, usernames), 'none');
    assert.strictEqual(ownerKind('bob', usernames), 'unknown');
  });

  it('checks the current version of each MRI, and changes nothing', async function () {
    const before = await nativeDb.collection('mri').find({ source: { $regex: '^' + PREFIX } }, { projection: { _id: 0 } })
      .toArray();
    const { counts, mris, addressUsers, addressUsersOwning } = await checkMriOwners(nativeDb, { source: { $regex: '^' + PREFIX } });
    assert.deepEqual(counts, { user: 1, ip: 1, address: 3, forwarded: 1, forged: 1, none: 2, unknown: 1 });
    const kindOf = Object.fromEntries(mris.map((m) => [m.source.slice(PREFIX.length), m.kind]));
    assert.deepEqual(kindOf, {
      ip: 'ip',
      address: 'address',
      address6: 'address',
      forwarded: 'forwarded',
      forged: 'forged',
      none: 'none',
      missing: 'none',
      unknown: 'unknown',
      'address-user': 'address'
    });
    assert.include(addressUsers, '198.51.100.9');
    assert.deepEqual(addressUsersOwning.find((u) => u.nickname === '198.51.100.9'), { nickname: '198.51.100.9', sources: [PREFIX + 'address-user'] });
    const after = await nativeDb.collection('mri').find({ source: { $regex: '^' + PREFIX } }, { projection: { _id: 0 } })
      .toArray();
    assert.deepEqual(after, before);
  });
});
