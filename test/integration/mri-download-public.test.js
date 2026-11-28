'use strict';

// POST /mri/json downloads the MRI of any URL it is given. It downloads only
// from public addresses (S1b, F2 of microdraw's access audit of 2026-10-19):
// never this computer or the local network, also not through a name or a
// redirect, and with size and time limits. A Zenodo source, which answers
// with redirects, still downloads.

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const sinon = require('sinon');
const U = require('../utils.js');
const publicFetch = require('../../controller/mri/public-fetch');

const brainFile = path.join(__dirname, '../../public/test_data/bert_brain.nii.gz');
const dataDir = (source) => path.join(__dirname, '../../public/data', crypto.createHash('md5').update(source)
  .digest('hex'));
// a public-looking name, which the tests give the address of the stub server
const ZENODO = 'zenodo.example.org';

const listen = (server, host) => new Promise((resolve) => { server.listen(0, host, resolve); });

/**
 * Ask the server for the MRI of a URL, which starts its download, until the
 * download has ended
 * @param {string} source The MRI's URL
 * @returns {Promise<object>} The server's last answer
 */
const download = async (source) => {
  const deadline = Date.now() + 8000;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const res = await chai.request(U.serverURL).post('/mri/json')
      .send({ url: source, token: U.testToken + U.userFoo.nickname });
    if (!res.body || res.body.success !== 'downloading' || Date.now() > deadline) {
      return res;
    }
    // eslint-disable-next-line no-await-in-loop
    await U.delay(100);
  }
};

// eslint-disable-next-line max-statements
describe('POST /mri/json downloads only from public addresses', function () {
  let stub;
  const port = { value: 0 };
  const stubRequests = [];
  const sources = [];
  let realLimits;

  // path: what the stub server answers. /record/... is how Zenodo answers
  // an MRI's address: a redirect to /records/..., then one to the file
  const ANSWERS = {
    '/record/44855/files/MRI-n4.nii.gz': (res) => res.writeHead(301, { Location: '/records/44855/files/MRI-n4.nii.gz' }).end(),
    '/records/44855/files/MRI-n4.nii.gz': (res) => res.writeHead(302, {
      Location: `http://${ZENODO}:${port.value}/api/records/44855/files/MRI-n4.nii.gz/content`
    }).end(),
    '/api/records/44855/files/MRI-n4.nii.gz/content': (res) => {
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="MRI-n4.nii.gz"'
      });
      fs.createReadStream(brainFile).pipe(res);
    },
    '/redirect-inside.nii.gz': (res) => res.writeHead(302, { Location: `http://[::1]:${port.value}/secret.nii.gz` }).end(),
    '/large.nii.gz': (res) => res.end('x'.repeat(2000)),
    '/large-chunked.nii.gz': (res) => {
      res.write('x'.repeat(600));
      res.end('x'.repeat(600));
    },
    '/slow.nii.gz': (res) => {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.write('x');
      setTimeout(() => res.end('x'), 1000);
    }
  };

  /**
   * The address of a path of the stub server, under a host name
   * @param {string} host The host
   * @param {string} pathname The path
   * @returns {string} The URL, remembered to be cleaned up
   */
  const at = (host, pathname) => {
    const source = `http://${host}:${port.value}${pathname}`;
    sources.push(source);

    return source;
  };

  // ZENODO has, for the test, the address of this computer, which is let through
  const publicName = () => {
    sinon.stub(publicFetch, 'lookup').resolves([{ address: '127.0.0.1', family: 4 }]);
    U.allowTestServer();
  };

  const assertRefused = (res, message) => {
    assert.equal(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.include(res.body.error, message);
  };

  before(async function () {
    realLimits = { MAX_BYTES: publicFetch.MAX_BYTES, IDLE_LIMIT_MS: publicFetch.IDLE_LIMIT_MS };
    stub = http.createServer((req, res) => {
      stubRequests.push(req.url);
      (ANSWERS[req.url] || ((r) => r.end('internal service: not for downloads')))(res);
    });
    // on both loopbacks, at the same port
    await listen(stub, '::');
    port.value = stub.address().port;
  });

  after(async function () {
    stub.close();
    for (const source of sources) {
      // eslint-disable-next-line no-await-in-loop
      await U.removeMRI({ dirPath: dataDir(source), srcURL: source });
    }
  });

  beforeEach(function () {
    stubRequests.length = 0;
    publicFetch.isRefusedAddress = U.realIsRefusedAddress;
  });

  afterEach(function () {
    sinon.restore();
    Object.assign(publicFetch, realLimits);
    U.allowTestServer();
  });

  describe('the addresses refused', function () {
    const refused = [
      '127.0.0.1', '::1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1',
      '0.0.0.0', '224.0.0.1', '240.0.0.1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:a01:203',
      // not refused by microdraw's copy (S1a)
      '192.0.0.170', '198.18.0.1', '198.19.255.255', '64:ff9b::7f00:1', '2002:7f00:1::1'
    ];
    for (const address of refused) {
      it(`refuses ${address}`, function () {
        assert.isTrue(publicFetch.isRefusedAddress(address));
      });
    }
    for (const address of ['188.185.124.72', '8.8.8.8', '2001:4860:4860::8888', '192.0.2.1', '198.20.0.1']) {
      it(`lets ${address} through`, function () {
        assert.isFalse(publicFetch.isRefusedAddress(address));
      });
    }
  });

  describe('internal addresses', function () {
    for (const host of ['127.0.0.1', '[::1]', '10.1.2.3', '169.254.169.254', '[::ffff:127.0.0.1]', '198.18.0.1', '[64:ff9b::7f00:1]']) {
      it(`refuses ${host}`, async function () {
        const res = await download(at(host, '/secret.nii.gz'));
        assert.equal(res.status, 403);
        assert.notStrictEqual(res.body.success, true);
        assert.deepEqual(stubRequests, []);
      });
    }

    it('refuses a public-looking name with an internal address', async function () {
      sinon.stub(publicFetch, 'lookup').resolves([{ address: '127.0.0.1', family: 4 }]);
      assertRefused(await download(at(ZENODO, '/secret.nii.gz')), 'not a public address');
      assert.deepEqual(stubRequests, []);
    });

    it('refuses a name with one internal address among public ones', async function () {
      sinon.stub(publicFetch, 'lookup').resolves([{ address: '192.0.2.1', family: 4 }, { address: '10.0.0.1', family: 4 }]);
      assertRefused(await download(at(ZENODO, '/secret.nii.gz')), 'not a public address');
    });

    it('refuses a scheme other than http and https', async function () {
      const res = await download('ftp://' + ZENODO + '/brain.nii.gz');
      assert.equal(res.status, 403);
      assert.notStrictEqual(res.body.success, true);
    });
  });

  describe('redirects', function () {
    it('refuses a redirect to an internal address, at that hop', async function () {
      publicName();
      assertRefused(await download(at(ZENODO, '/redirect-inside.nii.gz')), 'not a public address: ::1');
      assert.deepEqual(stubRequests, ['/redirect-inside.nii.gz']);
    });

    it('downloads a Zenodo record, through its redirects', async function () {
      publicName();
      const source = at(ZENODO, '/record/44855/files/MRI-n4.nii.gz');
      const res = await download(source);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.filename, 'MRI-n4.nii.gz');
      assert.lengthOf(res.body.dim, 3);
      // the first three: a poll that reads the MRI before the download's document is written,
      // and checks the queue after it is emptied, starts a second download (older than S1b)
      assert.deepEqual(stubRequests.slice(0, 3), [
        '/record/44855/files/MRI-n4.nii.gz',
        '/records/44855/files/MRI-n4.nii.gz',
        '/api/records/44855/files/MRI-n4.nii.gz/content'
      ]);
      const stored = await fs.promises.readFile(path.join(dataDir(source), 'MRI-n4.nii.gz'));
      assert.isTrue(stored.equals(await fs.promises.readFile(brainFile)));

      // served as data: opened as a page, it would run no script, nor have BrainBox's origin
      const served = await chai.request(U.serverURL).head(`/data/${path.basename(dataDir(source))}/MRI-n4.nii.gz`);
      assert.equal(served.status, 200);
      assert.equal(served.headers['content-security-policy'], 'sandbox; default-src \'none\'');
      assert.equal(served.headers['x-content-type-options'], 'nosniff');
    }).timeout(U.mediumTimeout);
  });

  describe('limits', function () {
    const assertNoFile = async (source) => {
      const files = await fs.promises.readdir(dataDir(source)).catch(() => []);
      assert.deepEqual(files, []);
    };

    it('refuses a file announced as larger than the limit', async function () {
      publicName();
      publicFetch.MAX_BYTES = 1000;
      const source = at(ZENODO, '/large.nii.gz');
      assertRefused(await download(source), 'larger than 1000 bytes');
      await assertNoFile(source);
    });

    it('cuts a file that grows larger than the limit', async function () {
      publicName();
      publicFetch.MAX_BYTES = 1000;
      const source = at(ZENODO, '/large-chunked.nii.gz');
      assertRefused(await download(source), 'larger than 1000 bytes');
      await assertNoFile(source);
    });

    it('stops when the server stops sending', async function () {
      publicName();
      publicFetch.IDLE_LIMIT_MS = 200;
      const source = at(ZENODO, '/slow.nii.gz');
      assertRefused(await download(source), 'the server stopped sending');
      await assertNoFile(source);
    });
  });
});
