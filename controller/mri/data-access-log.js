// temporary: T005 5g /data check — remove after enforcing
'use strict';

/**
 * A record of the requests for files under /data that the access check
 * (data-access.js) refused, or would refuse in log mode, for the admin page.
 * Temporary: it is there to watch the check in log mode before it enforces,
 * and goes away with it (every piece is marked "temporary: T005 5g").
 *
 * One document per (hour, user, MRI folder, file, reason, mode), counting the
 * requests (upsert), so that a page asking for the same file again and again
 * writes no new documents. Kept 30 days (TTL index on lastSeen). Only the
 * time, user, folder, file, MRI source, reason, mode, count and the page that
 * asked (Referer, without any token) are kept: no other header, no address.
 */
const { dataAccessMode } = require('./data-access');

const collectionName = 'dataAccessLog';
const keepSeconds = 30 * 24 * 3600;
const maxRefererLength = 500;
const maxPageSize = 200;

/**
 * Create the indexes of the collection (idempotent)
 * @param {object} nativeDb MongoDB database
 * @returns {Promise} Resolves when created
 */
const createDataAccessLogIndexes = (nativeDb) => Promise.all([
  nativeDb.collection(collectionName).createIndex({ lastSeen: 1 }, { expireAfterSeconds: keepSeconds }),
  nativeDb.collection(collectionName).createIndex({ hour: 1, user: 1, md5: 1, file: 1, reason: 1, mode: 1 })
]);

/**
 * The page that asked for the file, without a token in its query
 * @param {string} [referer] The Referer header
 * @returns {string|null} The page, or null
 */
const cleanReferer = (referer) => {
  if (typeof referer !== 'string' || referer === '') {
    return null;
  }
  let clean = referer;
  try {
    const url = new URL(referer);
    url.searchParams.delete('token');
    clean = url.href;
  } catch (err) {
    clean = referer.replace(/([?&])token=[^&#]*/gi, '$1');
  }

  return clean.slice(0, maxRefererLength);
};

/**
 * A function that records a refusal, without waiting and without failing
 * @param {object} nativeDb MongoDB database
 * @param {object} [options] Options
 * @param {function} [options.now] The current time
 * @returns {function} record({ user, md5, file, source, reason, mode, referer }): returns the write's promise, which never rejects
 */
const dataAccessRecorder = (nativeDb, { now = () => new Date() } = {}) => (entry) => {
  try {
    const time = now();
    const hour = new Date(Math.floor(time.getTime() / 3600000) * 3600000);
    const key = {
      hour,
      user: entry.user || 'anonymous',
      md5: entry.md5 || null,
      file: entry.file,
      reason: entry.reason,
      mode: entry.mode
    };
    const referer = cleanReferer(entry.referer);

    return nativeDb.collection(collectionName).updateOne(key, {
      $setOnInsert: { firstSeen: time, source: entry.source || null },
      $set: { lastSeen: time, ...(referer ? { referer } : {}) },
      $inc: { count: 1 }
    }, { upsert: true })
      .catch((err) => console.error('ERROR: could not record a DATA_ACCESS refusal', err.message));
  } catch (err) {
    console.error('ERROR: could not record a DATA_ACCESS refusal', err.message);

    return Promise.resolve();
  }
};

/**
 * GET /admin/json/data-access?page=<n>&limit=<n>: the check's mode, the totals
 * by reason, and the latest records, newest first (admins only, see the route)
 * @param {object} req Request object
 * @param {object} res Response object
 * @returns {Promise<void>} Resolves once answered
 */
const getDataAccessLog = async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), maxPageSize);
  const page = Math.max(parseInt(req.query.page, 10) || 0, 0);
  try {
    const collection = req.nativeDb.collection(collectionName);
    const [list, totals, total] = await Promise.all([
      collection.find({}, { projection: { _id: 0 } })
        .sort({ lastSeen: -1 })
        .skip(page * limit)
        .limit(limit)
        .toArray(),
      collection.aggregate([
        { $group: { _id: '$reason', entries: { $sum: 1 }, requests: { $sum: '$count' } } },
        { $sort: { requests: -1, _id: 1 } }
      ]).toArray(),
      collection.countDocuments({})
    ]);
    res.json({
      success: true,
      mode: dataAccessMode(process.env.DATA_ACCESS_CHECK),
      page,
      limit,
      total,
      totals: totals.map(({ _id, entries, requests }) => ({ reason: _id, entries, requests })),
      list
    });
  } catch (err) {
    console.log('ERROR:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

module.exports = {
  collectionName,
  createDataAccessLogIndexes,
  cleanReferer,
  dataAccessRecorder,
  getDataAccessLog
};
