'use strict';

/*
  The shared icons are nwl-components' (UI kit step 11c): the pages, the CSS and the user
  doc load them from /lib/nwl-components/icons/<name>.svg, which app.js serves from the
  package's dist/.
*/

const chai = require('chai');
const { assert } = chai;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');

describe('nwl-components icons', function () {
  it('serves /lib/nwl-components/icons/settings.svg as an SVG', async function () {
    const res = await chai.request(U.serverURL).get('/lib/nwl-components/icons/settings.svg');
    assert.strictEqual(res.status, 200);
    assert.match(res.headers['content-type'], /^image\/svg\+xml/);
  });
});
