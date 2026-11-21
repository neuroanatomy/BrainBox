'use strict';

/*
  Roboto on BrainBox's pages (T002 R2d). The app pages use Roboto at 100 only (nwl-components'
  wordmark), from nwl-components' fonts.css: they don't link BrainBox's own
  /fonts/roboto/roboto.css. That sheet stays for the documentation (/doc/ and /doc/embed.html),
  with the faces it uses: 300 (the text, h1, h2, strong), 100 (h3) and 500, the nearest face to
  the bold (700) of h4 and th. The records below were taken before the app pages dropped the
  link and the folder dropped its 200 and 400 faces: the computed font of every element in Roboto,
  and the Roboto faces loaded, are the same after.
  The documentation pages convert their Markdown with showdown, from a CDN the test browser
  doesn't reach: the test answers that request with a converter that gives one of each element
  the two Markdown files make (headings 1-4, bold, italic, code, links, lists, tables).
*/

const chai = require('chai');
const { assert, expect } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');
const admins = require('../../controller/admin/admins');

const SHOWDOWN = 'https://cdn.jsdelivr.net/npm/showdown@1.9.1/dist/showdown.min.js';
const DOC_HTML = [
  '<h1>BrainBox</h1><p>Text, <strong>bold</strong>, <em>italic</em>, <code>code</code> and <a href="#x">a link</a>.<br>More</p>',
  '<h2>Section</h2><h3>Subsection</h3><h4>General information</h4><h4><strong>Table 1.</strong> Summary</h4>',
  '<ul><li>item</li></ul><ol><li>step</li></ol><pre><code>code block</code></pre>',
  '<table><thead><tr><th>Attribute</th><th>What it does</th></tr></thead>',
  '<tbody><tr><td><code>data-url</code></td><td><strong>Required.</strong> URL</td></tr></tbody></table>'
].join('');
const SHOWDOWN_STUB = `window.showdown = { setOption() {}, Converter: function () { this.makeHtml = () => ${JSON.stringify(DOC_HTML)}; } };`;

const APP_TITLE = ['span.title|Roboto, sans-serif|100|normal'];
const doc = (weight, tags) => tags.map((t) => `${t}|Roboto, Helvetica, Arial, sans-serif|${weight}|normal`);

/* The records taken before the change (step 1 of the brief): for each page, every element in
   Roboto as "tag.classes|font-family|font-weight|font-style", and the Roboto faces loaded as
   "weight style subset". The home page has nothing in Roboto. On /doc, h4 and th are bold
   (700): the browser draws them with the 500 face. */
const DOC_RECORD = {
  elements: [
    ...doc(300, ['a', 'body', 'br']),
    'em|Roboto, Helvetica, Arial, sans-serif|300|italic',
    ...doc(300, ['h1', 'h2']), ...doc(100, ['h3']), ...doc(700, ['h4']),
    ...doc(300, ['li', 'ol', 'p', 'strong', 'table', 'tbody', 'td', 'thead']),
    ...doc(700, ['th']), ...doc(300, ['tr', 'ul'])
  ],
  faces: ['100 normal latin', '300 normal latin', '500 normal latin']
};
const APP_RECORD = { elements: APP_TITLE, faces: ['100 normal latin'] };

const APP_PAGES = {
  home: { path: '/', selector: '.app', record: { elements: [], faces: [] } },
  project: { path: `/project/${U.projectTest.shortname}`, selector: '#atlasmaker', record: APP_RECORD },
  settings: { path: `/project/${U.projectTest.shortname}/settings`, selector: '.app', record: APP_RECORD },
  newProject: { path: '/project/new', selector: '.app', record: APP_RECORD },
  user: { path: '/user/foo', selector: '.app', record: APP_RECORD },
  mri: { path: `/mri?url=${U.localBertURL}`, selector: '#atlasmaker', record: APP_RECORD },
  askForLogin: { path: '/project/new', selector: '.ask-for-login', loggedOut: true, record: APP_RECORD },
  admin: { path: '/admin', selector: '.app', record: APP_RECORD }
};
const DOC_PAGES = {
  doc: { path: '/doc/', selector: 'h4', record: DOC_RECORD },
  docEmbed: { path: '/doc/embed.html', selector: 'h4', record: DOC_RECORD }
};

/**
 * A page's Roboto: once its fonts are ready, every element whose font is Roboto (its tag and
 * classes, computed font-family, font-weight and font-style, without repeats), the Roboto faces
 * document.fonts has loaded (weight, style and subset), and the URLs it requested under
 * /fonts/roboto/
 * @param {Object} browser A puppeteer browser
 * @param {Object} where The page: its path, an element it must have, and whether it is seen logged out
 * @param {Array} cookies The session cookies
 * @returns {Promise<Object>} The elements, the faces and the requests
 */
const robotoOf = async (browser, where, cookies) => {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const requested = [];
  try {
    if (!where.loggedOut) { await page.setCookie(...cookies); }
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/fonts/roboto/')) { requested.push(new URL(url).pathname); }
      if (url === SHOWDOWN) {
        req.respond({ status: 200, contentType: 'text/javascript', body: SHOWDOWN_STUB });
      } else if (!U.isLocalURL(url)) {
        req.abort();
      } else {
        req.continue();
      }
    });
    await page.goto(U.serverURL + where.path, { waitUntil: 'load' });
    await page.waitForSelector(where.selector, { timeout: U.longTimeout });
    const res = await page.evaluate(async () => {
      await document.fonts.ready;
      const isRoboto = (family) => family.split(',')[0].trim()
        .replace(/"/gu, '') === 'Roboto';
      const elements = [...document.querySelectorAll('body, body *')]
        .map((el) => [el, getComputedStyle(el)])
        .filter(([, style]) => isRoboto(style.fontFamily))
        .map(([el, style]) => [
          [el.tagName.toLowerCase(), ...[...el.classList].sort()].join('.'),
          style.fontFamily, style.fontWeight, style.fontStyle
        ].join('|'));
      const faces = [...document.fonts]
        .filter((f) => f.family.replace(/"/gu, '') === 'Roboto' && f.status === 'loaded')
        .map((f) => `${f.weight} ${f.style} ${(/1E00/iu).test(f.unicodeRange) ? 'latin-ext' : 'latin'}`);

      return { elements: [...new Set(elements)].sort(), faces: [...new Set(faces)].sort() };
    });

    return { ...res, requested };
  } finally {
    await context.close();
  }
};

describe('Roboto: the app pages take it from nwl-components, /doc from /fonts/roboto (T002 R2d)', function () {
  let browser;
  let cookies;
  let previousAdmins;

  before(async function () {
    // eslint-disable-next-line no-invalid-this
    this.timeout(U.longTimeout);
    const agent = chai.request.agent(U.serverURL);
    await agent.post('/localSignup').send(U.testingCredentials);
    const res = await agent.post('/localLogin').redirects(0)
      .send(U.testingCredentials);
    expect(res).to.have.cookie('connect.sid');
    cookies = U.parseCookies(res.headers['set-cookie'][0]);
    previousAdmins = admins.getAdmins();
    admins.setAdmins([U.testingCredentials.username]);
    browser = await U.launchBrowser({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    await U.waitForTestBrain();
  });

  after(async function () {
    admins.setAdmins(previousAdmins);
    if (browser) { await browser.close(); }
  });

  it('no app page requests anything under /fonts/roboto/, their Roboto as before', async function () {
    for (const [name, where] of Object.entries(APP_PAGES)) {
      // eslint-disable-next-line no-await-in-loop
      const res = await robotoOf(browser, where, cookies);
      assert.deepEqual(res.requested, [], name);
      assert.deepEqual({ elements: res.elements, faces: res.faces }, where.record, name);
    }
  }).timeout(U.longTimeout);

  it('/doc/ and /doc/embed.html load their faces from /fonts/roboto/, their Roboto as before', async function () {
    for (const [name, where] of Object.entries(DOC_PAGES)) {
      // eslint-disable-next-line no-await-in-loop
      const res = await robotoOf(browser, where, cookies);
      assert.include(res.requested, '/fonts/roboto/roboto.css', name);
      assert.isTrue(res.requested.some((p) => p.endsWith('.woff2')), `${name}: a face is requested`);
      assert.deepEqual({ elements: res.elements, faces: res.faces }, where.record, name);
    }
  }).timeout(U.longTimeout);
});
