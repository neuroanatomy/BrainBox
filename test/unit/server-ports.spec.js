'use strict';
/* eslint-disable camelcase */ // cfg.json's keys

const { assert } = require('chai');
const { serverPorts } = require('../../app.js');

describe('serverPorts', function () {
  it('uses app_port and ws_port from cfg.json', function () {
    assert.deepEqual(serverPorts({ app_port: 4001, ws_port: 9080 }), { appPort: 4001, wsPort: 9080 });
  });

  it('uses 3001 and 8080 when cfg.json does not set them', function () {
    assert.deepEqual(serverPorts({ hostname: 'http://localhost:3001', wshostname: 'localhost:8080', secure: false }), { appPort: 3001, wsPort: 8080 });
  });

  it('sets each port on its own', function () {
    assert.deepEqual(serverPorts({ app_port: 4001 }), { appPort: 4001, wsPort: 8080 });
    assert.deepEqual(serverPorts({ ws_port: 9080 }), { appPort: 3001, wsPort: 9080 });
  });
});
