'use strict';

const fs = require('fs');
const chai = require('chai');
const assert = chai.assert;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const WebSocket = require('ws');
const U = require('../utils.js');

let u1, u2;
const msg1 = JSON.stringify({type:"echo", msg:"hi bruh"});
const msg2 = {
    type: "userData",
    user: U.userFooB, // version B has username instead of nickname...
    description: "allUserData"
};
const msg3 = {
    type: "userData",
    description: "sendAtlas",
};
let mri;

describe('TESTING WEBSOCKET WORKFLOW', () => {
    before(async () => {
        u1 = new WebSocket('wss://localhost:8080');
        u2 = new WebSocket('wss://localhost:8080');
    });

    after(async function () {
        u1.close();
        u2.close();
    });

    describe('WS connection', async function () {
        it('Can create a WS connection', (done) => {
            u1.on('open', () => {
                done();
            });
        });
        it('Can send little data', (done) => {
            u1.send(msg1);
            done();
        });
        it('Can trigger a data download', async () => {
            let res = await chai.request(U.serverURL).post('/mri/json').send({url: U.localBertURL,token: U.testToken});
            let {body} = res;
            if(body.success === true) {
                mri = body;
            } else {
                await U.delay(3*1000);
                res = await chai.request(U.serverURL).get('/mri/json').query({url: U.localBertURL});
                mri = res.body;
            }
        });
        it('Can send larger data', (done) => {
            msg2.user.dirname = mri.url;
            msg2.user.mri = mri.mri.brain;
            msg2.user.atlasFilename = mri.mri.atlas[0].filename;
            u1.send(JSON.stringify(msg2));
            done();
        });
        it('Can request data', (done) => {
            u1.send(JSON.stringify(msg3));
            done();
        });
        it('Can receive data', (done) => {
            u1.on('message', (data) => {
                assert(Buffer.isBuffer(data));
                done();
            });
        });
    });


});
