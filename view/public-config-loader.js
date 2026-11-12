/**
 * A webpack loader for cfg.json: the module it gives has only the keys listed
 * in its options (webpack.public-config.js), so the rest of the server's
 * configuration stays out of the public bundles.
 * @param {string} source The cfg.json text
 * @returns {string} A CommonJS module exporting the public keys
 */
module.exports = function publicConfigLoader(source) {
  const { keys } = this.getOptions ? this.getOptions() : this.query;
  const cfg = JSON.parse(source);
  const picked = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(cfg, key)) {
      picked[key] = cfg[key];
    }
  }

  return `module.exports = ${JSON.stringify(picked)};`;
};
