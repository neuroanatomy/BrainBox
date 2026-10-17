#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

/*
  List the MRIs whose owner is not what BrainBox now stores. Read only: it changes
  nothing.

  The owner of an MRI (its `owner` field) is the user who added it, or, for an
  anonymous visitor, 'ip:' and the visitor's address. Until 2026-10, an anonymous
  visitor's MRI was owned by the raw X-Forwarded-For header, which the client may
  set: behind Apache, 'what the client sent, its address' (a list), or the address
  alone when the client sent nothing. Since the owner always sees their MRI, a
  visitor could try to make an MRI theirs, or someone else's.

  Only the current version of each MRI is checked (not the backups). Each owner is
  one of:
    user          an existing username (in the user collection, field nickname)
    ip            'ip:' and an address: added anonymously, since 2026-10
    address       an address alone: added anonymously, before 2026-10
    forwarded     a list of addresses: added anonymously behind a proxy
    forged        a list whose first entries are not all addresses: an anonymous
                  visitor sent their own X-Forwarded-For (the first entry is what
                  they sent)
    none          'anonymous', empty or missing
    unknown       anything else: a user who no longer exists, or a value sent as
                  X-Forwarded-For to the server directly (not through the proxy)
  The MRIs owned by a username cannot be told apart from those an anonymous
  visitor made look owned by that user by reaching the server directly with
  X-Forwarded-For: <username>; behind Apache that could not happen, since Apache
  adds the client's address to what the client sent (those are 'forged').
  Users whose username is an address are listed too: before 2026-10, they owned
  the MRIs added anonymously from that address (they no longer do).

  Usage:
    MONGODB=localhost:27017/brainbox node bin/check-mri-owners.js [--all]

  It lists the MRIs of the kinds forged, unknown and none, and counts the others;
  with --all, it lists every MRI not owned by a user.
*/

const net = require('net');
const { MongoClient } = require('mongodb');

const KINDS = ['user', 'ip', 'address', 'forwarded', 'forged', 'none', 'unknown'];
const LISTED = ['forged', 'unknown', 'none'];

/**
 * The kind of an MRI's owner
 * @param {*} owner The owner field
 * @param {Set<string>} usernames The existing usernames
 * @returns {string} One of KINDS
 */
const ownerKind = (owner, usernames) => {
  if (typeof owner !== 'string' || owner === '' || owner === 'anonymous') {
    return 'none';
  }
  if (owner.startsWith('ip:') && net.isIP(owner.slice(3))) {
    return 'ip';
  }
  if (net.isIP(owner)) {
    return 'address';
  }
  if (usernames.has(owner)) {
    return 'user';
  }
  const entries = owner.split(',').map((e) => e.trim());
  if (entries.length > 1) {
    // the last entry is the one the proxy added
    return entries.slice(0, -1).every((e) => net.isIP(e)) ? 'forwarded' : 'forged';
  }

  return 'unknown';
};

/**
 * Check the owners of the current versions of the MRIs
 * @param {Object} db Native MongoDB database
 * @param {Object} [query] Only the MRIs that match it, too
 * @returns {Promise<Object>} { counts: {kind: n}, mris: [{source, owner, kind, included}],
 *   addressUsers: [nickname], addressUsersOwning: [{nickname, sources}] }
 */
const checkMriOwners = async (db, query = {}) => {
  const users = await db.collection('user')
    .find({ backup: { $exists: false } }, { projection: { _id: 0, nickname: 1 } })
    .toArray();
  const usernames = new Set(users.map((u) => u.nickname).filter((n) => typeof n === 'string'));
  const mris = await db.collection('mri')
    .find({ ...query, backup: { $exists: false } }, { projection: { _id: 0, source: 1, owner: 1, included: 1 } })
    .toArray();
  const counts = Object.fromEntries(KINDS.map((k) => [k, 0]));
  const checked = mris.map(({ source, owner, included }) => {
    const kind = ownerKind(owner, usernames);
    counts[kind] += 1;

    return { source, owner, kind, included };
  });
  const addressUsers = [...usernames].filter((n) => net.isIP(n)).sort();
  const addressUsersOwning = addressUsers
    .map((nickname) => ({ nickname, sources: checked.filter((m) => m.owner === nickname).map((m) => m.source) }))
    .filter((u) => u.sources.length > 0);

  return { counts, mris: checked.filter((m) => m.kind !== 'user'), addressUsers, addressUsersOwning };
};

/**
 * Print what checkMriOwners found
 * @param {Object} result What checkMriOwners returns
 * @param {boolean} all List every MRI not owned by a user
 * @returns {void}
 */
const printReport = ({ counts, mris, addressUsers, addressUsersOwning }, all) => {
  for (const kind of KINDS) {
    console.log(`  ${kind}: ${counts[kind]}`);
  }
  for (const { source, owner, kind, included } of mris) {
    if (all || LISTED.includes(kind)) {
      console.log(`${kind}\t${JSON.stringify(owner)}\t${included || ''}\t${source}`);
    }
  }
  console.log(`Users whose username is an address: ${addressUsers.length ? addressUsers.join(', ') : 'none'}.`);
  for (const { nickname, sources } of addressUsersOwning) {
    console.log(`  ${nickname} is the owner of ${sources.length} MRIs: ${sources.join(' ')}`);
  }
};

const main = async () => {
  const all = process.argv.slice(2).includes('--all');
  let url = process.env.MONGODB || 'localhost:27017/brainbox';
  if (!url.startsWith('mongodb')) { url = 'mongodb://' + url; }
  const client = await MongoClient.connect(url);
  try {
    const db = client.db();
    console.log(`Checking the owners of the MRIs in ${db.databaseName} (read only).`);
    printReport(await checkMriOwners(db), all);
  } finally {
    await client.close();
  }
};

if (require.main === module) {
  main().catch((err) => {
    console.error('ERROR:', err.message);
    process.exitCode = 1;
  });
}

module.exports = { checkMriOwners, ownerKind };
