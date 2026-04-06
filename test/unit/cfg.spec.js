'use strict';

const { assert } = require('chai');
const fs = require('fs');
const path = require('path');

describe('cfg.json validation', function () {
  let cfg;

  before(async function () {
    const cfgPath = path.resolve(__dirname, '../../cfg.json');
    try {
      await fs.promises.access(cfgPath);
    } catch {
      this.skip(); // eslint-disable-line no-invalid-this

      return;
    }
    cfg = JSON.parse(await fs.promises.readFile(cfgPath, 'utf8'));
  });

  it('hostname should include a protocol (http:// or https://)', function () {
    assert.match(cfg.hostname, /^https?:\/\//, 'hostname must start with http:// or https://');
  });

  it('wshostname should not include a protocol (ws:// or wss://)', function () {
    assert.notMatch(cfg.wshostname, /^wss?:\/\//, 'wshostname must not start with ws:// or wss:// — the code prepends the protocol based on the "secure" flag');
  });

  it('should have required fields with correct types', function () {
    assert.isString(cfg.hostname);
    assert.isString(cfg.wshostname);
    assert.isBoolean(cfg.secure);
  });
});
