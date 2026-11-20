'use strict';

// The WebSocket `userNameQuery` is gone: the pages search users with
// GET /api/userNameQuery. A socket that still sends one gets no answer, and
// stays open: its next message is answered.

const { assert } = require('chai');
const WebSocket = require('ws');
const U = require('../utils.js');

/**
 * Open an anonymous socket
 * @returns {Promise<object>} { socket, messages (the JSON ones received), answered(n) (resolves once n projectNameQuery answers are in) }
 */
const connect = async () => {
  const socket = new WebSocket(U.wsURL);
  const messages = [];
  let waiter = null;
  socket.on('message', (data) => {
    if (typeof data === 'string') {
      messages.push(JSON.parse(data));
    }
    if (waiter) {
      waiter();
    }
  });
  await new Promise((resolve, reject) => {
    socket.on('open', resolve);
    socket.on('error', reject);
  });
  const answered = (n) => new Promise((resolve) => {
    waiter = () => {
      if (messages.filter((m) => m.type === 'projectNameQuery').length >= n) {
        waiter = null;
        resolve();
      }
    };
    waiter();
  });

  return { socket, messages, answered };
};

describe('WebSocket userNameQuery (removed)', function () {
  it('gets no answer, and the next message on the connection is still answered', async function () {
    const { socket, messages, answered } = await connect();
    const free = 'no-such-project-' + Date.now();

    socket.send(JSON.stringify({ type: 'userNameQuery', metadata: { nickname: U.userFoo.nickname } }));
    socket.send(JSON.stringify({ type: 'userNameQuery', metadata: { name: U.userFoo.name } }));
    socket.send(JSON.stringify({ type: 'projectNameQuery', metadata: { name: free } }));
    await answered(1);
    // a second round trip, so that a late answer to the user name queries would be here too
    socket.send(JSON.stringify({ type: 'projectNameQuery', metadata: { name: free } }));
    await answered(2);

    assert.strictEqual(socket.readyState, WebSocket.OPEN);
    assert.deepStrictEqual(messages.filter((m) => m.type === 'userNameQuery'), []);
    socket.close();
  });
});
