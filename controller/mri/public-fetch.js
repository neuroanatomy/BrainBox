'use strict';

/**
 * Downloads from an address that anyone can give (POST /mri/json downloads the
 * MRI of any URL) reach only public servers: never this computer, the local
 * network or the cloud's metadata service (F2 of microdraw's access audit of
 * 2026-10-19, S1b).
 *
 * A copy of microdraw's guard, app/routes/publicFetch.js (S1a, 72162aa), with
 * three changes:
 * - the answer is streamed (an MRI volume can be hundreds of MB), not read
 *   into memory, and the limits are those of a volume;
 * - redirects are followed by default (5, as microdraw's /image), each one
 *   checked again: Zenodo answers with redirects;
 * - it also refuses 192.0.0.0/24, 198.18.0.0/15, 64:ff9b::/96 (NAT64) and
 *   2002::/16 (6to4), which microdraw's copy lets through.
 */

const dns = require('dns');
const http = require('http');
const https = require('https');
const net = require('net');
const { Transform } = require('stream');

// The largest volume downloaded. BrainBox reads the whole volume into memory,
// on the server (to cut slices) and in the browser, uncompressed: a 1 GiB
// .nii.gz is already several GiB there. The example volumes are tens of MB.
const MAX_BYTES = 1024 * 1024 * 1024;
// For the whole download, redirects included: 1 GiB in 30 minutes is 0.6 MB/s
const TIME_LIMIT_MS = 30 * 60 * 1000;
// Without a byte from the server for this long, the download stops
const IDLE_LIMIT_MS = 60 * 1000;
const MAX_REDIRECTS = 5;
const REDIRECTS = [301, 302, 303, 307, 308];

const refused = new net.BlockList();
[
  ['0.0.0.0', 8], // unspecified, "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // shared (carrier) address space
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, the cloud metadata service
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments (not in microdraw's copy)
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking (not in microdraw's copy)
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4] // reserved, broadcast
].forEach(([address, prefix]) => refused.addSubnet(address, prefix, 'ipv4'));
[
  ['::', 96], // unspecified, loopback and the old IPv4-compatible form
  ['64:ff9b::', 96], // NAT64: an IPv4 address behind a gateway (not in microdraw's copy)
  ['2002::', 16], // 6to4: an IPv4 address inside (not in microdraw's copy)
  ['fc00::', 7], // unique-local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local (old)
  ['ff00::', 8] // multicast
].forEach(([address, prefix]) => refused.addSubnet(address, prefix, 'ipv6'));

/**
 * An error with the HTTP status it stands for
 * @param {number} status The HTTP status
 * @param {string} message What to say
 * @returns {Error} The error
 */
const answerError = (status, message) => Object.assign(new Error(message), { status });

const guard = {
  // read from here, so that the tests can lower them
  MAX_BYTES,
  TIME_LIMIT_MS,
  IDLE_LIMIT_MS,

  /**
   * Whether an address is one a download must not reach. The rules for IPv4
   * also match its IPv4-mapped IPv6 form (::ffff:127.0.0.1).
   * @param {string} address An IP address
   * @returns {boolean} True for loopback, private, link-local, unique-local, unspecified, multicast or reserved
   */
  isRefusedAddress: (address) => {
    const family = net.isIP(address);

    return family === 0 || refused.check(address, family === 4 ? 'ipv4' : 'ipv6');
  },

  // replaced by the tests, to give a name the address they want
  lookup: (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true })
};

/**
 * The addresses to connect to for a URL's host, if all are public
 * @param {URL} target The address asked for
 * @returns {Promise<Array<{address: string, family: number}>>} The checked addresses
 */
const publicAddress = async (target) => {
  const hostname = target.hostname.replace(/^\[|\]$/g, '');
  const family = net.isIP(hostname);
  let addresses = [{ address: hostname, family }];
  if (family === 0) {
    try {
      addresses = await guard.lookup(hostname);
    } catch (err) {
      throw answerError(502, 'cannot find the server ' + hostname);
    }
  }
  // every address the name has: the connection could use any
  if (addresses.length === 0 || addresses.some(({ address }) => guard.isRefusedAddress(address))) {
    throw answerError(403, 'not a public address: ' + hostname);
  }

  return addresses;
};

/**
 * Read a URL as one a download may fetch
 * @param {string} address The address asked for
 * @returns {URL} The parsed URL
 */
const checkedURL = (address) => {
  let target;
  try {
    target = new URL(address);
  } catch (err) {
    throw answerError(400, 'not a valid address');
  }
  if (!['http:', 'https:'].includes(target.protocol)) {
    throw answerError(400, 'only http and https addresses');
  }

  return target;
};

/**
 * One GET to a public address, connecting to the address checked. Resolves
 * with the answer once its headers are in; its body is not read. The answer
 * is destroyed with an error at the deadline, or when the server sends
 * nothing for IDLE_LIMIT_MS.
 * @param {URL} target What to fetch
 * @param {object} headers Request headers
 * @param {number} deadline When to give up (ms since the epoch)
 * @returns {Promise<object>} The answer (an http.IncomingMessage)
 */
const getPublic = async (target, headers, deadline) => {
  const checked = await publicAddress(target);
  // not what a second lookup would give (DNS rebinding)
  const lookup = (hostname, options, callback) => (options && options.all
    ? callback(null, checked)
    : callback(null, checked[0].address, checked[0].family));
  const client = target.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    let answer = null;
    // certificates are verified: Node's default
    const request = client.get({
      protocol: target.protocol,
      hostname: target.hostname.replace(/^\[|\]$/g, ''),
      port: target.port,
      path: target.pathname + target.search,
      headers,
      lookup
    }, (response) => {
      answer = response;
      resolve(response);
    });
    // the answer once it has come, the request before
    const stop = (err) => (answer || request).destroy(err);
    const timer = setTimeout(() => stop(answerError(502, 'the server took too long to answer')), Math.max(0, deadline - Date.now()));
    request.setTimeout(guard.IDLE_LIMIT_MS, () => stop(answerError(502, 'the server stopped sending')));
    request.on('close', () => clearTimeout(timer));
    request.on('error', (err) => reject(err.status ? err : answerError(502, 'cannot fetch: ' + (err.code || err.message))));
  });
};

/**
 * Open a public address: http or https, a public IP, a verified certificate,
 * and each redirect checked again. The caller reads the body, through
 * sizeLimit().
 * @param {string} address The address asked for
 * @param {object} [options] Options
 * @param {object} [options.headers] Request headers
 * @param {number} [options.maxRedirects] How many redirects to follow
 * @returns {Promise<{response: object, url: string}>} The last answer, its body unread, and its address
 */
const openPublic = (address, { headers = {}, maxRedirects = MAX_REDIRECTS } = {}) => {
  const deadline = Date.now() + guard.TIME_LIMIT_MS;
  const hop = async (target, left) => {
    const response = await getPublic(target, headers, deadline);
    if (!(REDIRECTS.includes(response.statusCode) && response.headers.location)) {
      if (Number(response.headers['content-length']) > guard.MAX_BYTES) {
        response.destroy();
        throw answerError(413, 'the file is larger than ' + guard.MAX_BYTES + ' bytes');
      }

      return { response, url: target.href };
    }
    response.resume();
    if (left === 0) {
      throw answerError(502, 'too many redirects');
    }

    return hop(checkedURL(new URL(response.headers.location, target).href), left - 1);
  };

  return Promise.resolve().then(() => hop(checkedURL(address), maxRedirects));
};

/**
 * A stream that passes a body on while it is under the size limit, and fails
 * once it is over
 * @param {Function} [onProgress] Called with the number of bytes so far
 * @returns {Transform} The stream
 */
const sizeLimit = (onProgress) => {
  const max = guard.MAX_BYTES;
  let size = 0;

  return new Transform({
    transform (chunk, encoding, callback) {
      size += chunk.length;
      if (size > max) {
        callback(answerError(413, 'the file is larger than ' + max + ' bytes'));

        return;
      }
      if (onProgress) { onProgress(size); }
      callback(null, chunk);
    }
  });
};

guard.openPublic = openPublic;
guard.sizeLimit = sizeLimit;

module.exports = guard;
