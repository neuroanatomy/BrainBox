/**
 * The WebSocket tickets of the embed pages: NeuroWebLab's (1.12.0, embed/tickets.js).
 * mri.controller.js mints one on every /mri/embed render, scoped to an MRI
 * ({ dirname, mriSource, username }); atlasmakerServer.js looks it up when a
 * WebSocket presents `?embedTicket=`.
 *
 * This stays an object whose functions are called through it
 * (EmbedAccessService.findWsTicket(…)), so that a test can stub them.
 */
const { WS_TICKET_COLLECTION, mintWsTicket, findWsTicket } = require('neuroweblab');

module.exports = { WS_TICKET_COLLECTION, mintWsTicket, findWsTicket };
