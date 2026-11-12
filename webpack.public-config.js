/**
 * The page bundles import cfg.json, which webpack bundles whole: every key
 * (TLS file paths, the admins' usernames, ports) ended up in the public
 * bundles. This rule makes the import give only the keys the pages use.
 */
const path = require('path');

/** The cfg.json keys the browser code reads (atlasmaker.js, brainbox.js, index-page.js, project-new-page.js) */
const PUBLIC_KEYS = ['hostname', 'wshostname', 'secure'];

/** A webpack rule: cfg.json, through view/public-config-loader.js */
const publicConfigRule = {
  test: /[\\/]cfg\.json$/,
  type: 'javascript/auto',
  use: [{ loader: path.resolve(__dirname, 'view/public-config-loader.js'), options: { keys: PUBLIC_KEYS } }]
};

module.exports = { PUBLIC_KEYS, publicConfigRule };
