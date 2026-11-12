// The page bundles import cfg.json; webpack bundled it whole, so the TLS file
// paths and the admins' usernames were public (/js/index-page.js). The loader
// gives the bundles only the keys the browser code reads.

const fs = require('fs').promises;
const path = require('path');
const { expect } = require('chai');
const loader = require('../../view/public-config-loader');
const { PUBLIC_KEYS, publicConfigRule } = require('../../webpack.public-config');

const root = path.join(__dirname, '../..');
// a cfg.json as on a server (keys as in cfg.json.example)
const serverCfg = JSON.parse(`{
  "hostname": "https://brainbox.example", "wshostname": "brainbox.example:8080", "secure": true,
  "ssl_key": "/etc/ssl/key.pem", "ssl_cert": "/etc/ssl/cert.pem", "ssl_chain": "/etc/ssl/chain.pem",
  "admins": ["someone"], "app_port": 3001, "ws_port": 8080
}`);
const PRIVATE_KEYS = Object.keys(serverCfg).filter((key) => !PUBLIC_KEYS.includes(key));

const run = (cfg, keys = PUBLIC_KEYS) => {
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('module', loader.call({ getOptions: () => ({ keys }) }, JSON.stringify(cfg)))(mod);

  return mod.exports;
};

describe('UNIT TESTING THE PUBLIC CONFIG LOADER', function () {
  it('keeps only hostname, wshostname and secure', function () {
    expect(run(serverCfg)).to.deep.equal({
      hostname: 'https://brainbox.example',
      wshostname: 'brainbox.example:8080',
      secure: true
    });
  });

  it('leaves out a public key the cfg.json lacks', function () {
    expect(run({ hostname: 'h' })).to.deep.equal({ hostname: 'h' });
  });

  it('is used by every webpack config that bundles cfg.json', async function () {
    expect(publicConfigRule.test.test('/a/b/cfg.json')).to.equal(true);
    for (const name of ['webpack.atlasmaker.config.js', 'webpack.brainbox.config.js', 'webpack.pages.config.js']) {
      // eslint-disable-next-line no-await-in-loop
      expect(await fs.readFile(path.join(root, name), 'utf8'), name).to.include('publicConfigRule');
    }
  });

  // the bundles as built (CI builds before the tests; locally, after `npm run build`)
  it('the built bundles that import cfg.json carry none of its private keys', async function () {
    const bundles = ['public/js/index-page.js', 'public/js/project-new-page.js', 'public/lib/brainbox.js', 'public/lib/atlasmaker.js'];
    for (const bundle of bundles) {
      // eslint-disable-next-line no-await-in-loop
      const text = await fs.readFile(path.join(root, bundle), 'utf8');
      expect(text, bundle).to.include('wshostname');
      for (const key of PRIVATE_KEYS) {
        expect(text.includes(`"${key}"`), `${bundle} has "${key}"`).to.equal(false);
      }
    }
  });
});
