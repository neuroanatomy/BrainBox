const crypto = require('crypto');

// Ticket lives only long enough to cover a single embed page view/session -
// it is minted fresh on every /mri/embed render and is never reused across page loads.
const WS_TICKET_COLLECTION = 'embedWsTicket';
const WS_TICKET_DURATION = 6 * 3600 * 1000; // 6h

/**
 * Mint a short-lived, single-MRI-scoped ticket that an embed page's WebSocket
 * connection presents to prove it originated from a legitimate embed render.
 * @param {Object} nativeDb Native MongoDB driver database instance
 * @param {Object} scope The scope to bind the ticket to
 * @param {string} scope.dirname Directory path of the MRI on the server
 * @param {string} scope.mriSource Source URL of the MRI
 * @returns {Promise<string>} The minted ticket token
 */
const mintWsTicket = async function (nativeDb, { dirname, mriSource }) {
  const now = new Date();
  const ticket = {
    token: crypto.randomBytes(24).toString('hex'),
    dirname,
    mriSource,
    createdAt: now,
    expiryDate: new Date(now.getTime() + WS_TICKET_DURATION)
  };
  await nativeDb.collection(WS_TICKET_COLLECTION).insertOne(ticket);

  return ticket.token;
};

/**
 * Look up a previously minted WS ticket. Returns null for a missing, expired,
 * or otherwise invalid token - callers must treat that as "no scope granted",
 * never as "full access".
 * @param {Object} nativeDb Native MongoDB driver database instance
 * @param {string} token The ticket token presented by the client
 * @returns {Promise<Object|null>} The ticket document, or null if invalid
 */
const findWsTicket = async function (nativeDb, token) {
  if (!token) { return null; }

  const ticket = await nativeDb.collection(WS_TICKET_COLLECTION).findOne({ token });
  if (!ticket || ticket.expiryDate.getTime() < Date.now()) { return null; }

  return ticket;
};

module.exports = { mintWsTicket, findWsTicket };
