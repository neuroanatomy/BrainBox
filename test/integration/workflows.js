'use strict';

const fs = require('fs');
const chai = require('chai');
const assert = chai.assert;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const U = require('../utils.js');

describe('TESTING AN MRI UPLOAD/DOWNLOAD WORKFLOW', function (done) {
    describe('Fail soon', function () {
        it('Returns 404', async function () {
            const res = await chai.request(U.serverURL).post('/upload');
            assert.equal(res.statusCode, 404);
        });
    });

    describe('Create a test token', function () {
        it('Can create a test token', async function () {
            await U.insertTestTokenForUser("bar");
        });
    });

    describe('Simple upload workflow', function () {
        it('Does not find a non-existent user', async function () {
            const res = await U.queryUser("bar");
            assert.isNull(res);
        });
        it('Can insert a test user in the DB', async function () {
            await U.insertUser(U.userBar);
        });
        // it('Can upload an MRI', async function () {
        //     const res = await chai.request(url).post('/upload').query();
        // });
        it('Finds the inserted user', async function () {
            const res = await U.queryUser("bar");
            const expectedKeys = ["_id", "name", "nickname", "url", "brainboxURL", "avatarURL", "joined"];
            assert.hasAllKeys(res, expectedKeys);
            assert.equal(res.name, U.userBar.name);
            assert.equal(res.nickname, U.userBar.nickname);
            assert.equal(res.url, U.userBar.url);
        });
        it('Removes test user from the DB', async function () {
            await U.removeUser(U.userBar.nickname);
        });
        it('Does not find the removed user', async function () {
            const res = await U.queryUser("bar");
            assert.isNull(res);
        });
    });

    describe('Remove a test token', function () {
        it('Can remove a test token', async function () {
            await U.removeTestTokenForUser("bar");
        });
    });
});
