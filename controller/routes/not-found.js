'use strict';

const path = require('path');

/**
 * Whether a request expects JSON: it accepts JSON before HTML, or its path is
 * an API path (/api/…) or a JSON path (…/json/…, …/json)
 * @param {Object} req Express request
 * @returns {boolean} true for a JSON request
 */
const wantsJSON = (req) => req.accepts(['html', 'json']) === 'json'
  || req.path.startsWith('/api/')
  || (/\/json(\/|$)/).test(req.path);

/**
 * Whether a request is for a page: a GET or HEAD that accepts HTML, at a path
 * without a file extension (or .html). A missing script, image or font is
 * asked with Accept: *\/*, which accepts HTML too: its extension tells it apart.
 * @param {Object} req Express request
 * @returns {boolean} true for a page request
 */
const wantsPage = (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { return false; }
  if (req.accepts(['html', 'json']) !== 'html') { return false; }
  const ext = path.extname(req.path).toLowerCase();

  return ext === '' || ext === '.html' || ext === '.htm';
};

/**
 * The requested path, decoded for display (the template escapes it)
 * @param {Object} req Express request
 * @returns {string} The path
 */
const displayPath = (req) => {
  try {
    return decodeURIComponent(req.path);
  } catch {
    return req.path;
  }
};

/**
 * Catch-all after the routes: 404 as a page, JSON or plain text, depending on
 * the request. The 404 is logged by the request logger (morgan), not here.
 * @param {Object} req Express request
 * @param {Object} res Express response
 * @returns {void}
 */
const notFound = (req, res) => {
  res.status(404);
  if (wantsJSON(req)) {
    res.json({ error: 'Not found' });
  } else if (wantsPage(req)) {
    res.render('error', { message: 'Page not found', path: displayPath(req) });
  } else {
    res.type('text/plain').send('Not found');
  }
};

/**
 * Error handler: the error's status (500 by default), as a page or JSON. The
 * stack shows only in development.
 * @param {Error} err The error
 * @param {Object} req Express request
 * @param {Object} res Express response
 * @param {Function} next Next middleware
 * @returns {void}
 */
// eslint-disable-next-line max-params
const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);

    return;
  }
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    console.error('ERROR:', req.method, req.originalUrl, err);
  }
  // a server error's message stays on the server, outside development
  const development = req.app.get('env') === 'development';
  const message = (status < 500 || development) ? err.message : 'Server error';
  res.status(status);
  if (wantsJSON(req)) {
    res.json({ error: message });
  } else {
    res.render('error', {
      message,
      error: development ? err : { status }
    });
  }
};

module.exports = { notFound, errorHandler, wantsJSON, wantsPage };
