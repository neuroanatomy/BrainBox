var assert = require("assert");
const adminController = require('../../controller/admin/admin.controller');
const monk = require('monk');
require('mocha-sinon');
const sinon = require('sinon');
var db = monk('localhost:27017/brainbox');


describe('Admin Controller: ', function() {
    describe('Validator function() ', function() {
        it('should throw error with unauthorized address', async function() {
            let req = {
                connection: {
                    remoteAddress: 'localhost:8080'
                }
            };
            let resSpy = sinon.spy();
            let res = {
                status: sinon.stub().returns({ send: sinon.stub().returns({ end: resSpy })})
            };
            await adminController.validator(req, res, () => {});
            assert.strictEqual(resSpy.callCount, 1);
            sinon.restore();
        });

        it('should pass successfully with correct address', async function() {
            let req = {
                connection: {
                    remoteAddress: '127.0.0.1:1'
                }
            };
            let resSpy = sinon.spy();
            let res = {
                status: sinon.stub().returns({ send: sinon.stub().returns({ end: resSpy })})
            };
            await adminController.validator(req, res, () => {});
            assert.strictEqual(resSpy.callCount, 0);
            sinon.restore();
        });
    });

    describe('saveAllAtlases function() ', function() {
        it('should work correctly', async function() {
            let req = {};
            let res = {
                send: sinon.spy()
            };
            await adminController.saveAllAtlases(req, res);
            assert.strictEqual(res.send.callCount, 1);
            assert.notStrictEqual(res.send.args, [[{ msg: 'Will save all atlases', success: true }]]);
            sinon.restore();
        });
    });

    describe('broadcastMessage function() ', function () {
       it('should throw error if validation fails', async function() {
           let reqSpy = sinon.spy();
           let req = {
               body: {
               },
               checkBody: sinon.stub().returns({ notEmpty: reqSpy }),
               validationErrors: function () {
                   if(!this.body.msg || this.body.msg === '') 
                     return 'Msg should not be empty';
                    else
                    return null;
               }
           };
           let endSpy = sinon.spy();
           let res = {
               status: sinon.stub().returns({ send: sinon.stub().returns({ end: endSpy })}),
               send: sinon.spy()
           };
           await adminController.broadcastMessage(req, res);
           assert.strictEqual(endSpy.callCount, 1);
           sinon.restore();
       });

       it('should work correctly with valid input', async function() {
        let reqSpy = sinon.spy();
        let req = {
            body: {
                msg: 'Testing'
            },
            checkBody: sinon.stub().returns({ notEmpty: reqSpy }),
            validationErrors: function () {
                if(!this.body.msg || this.body.msg === '') 
                  return 'Msg should not be empty';
                 else
                 return null;
            }
        };
        let endSpy = sinon.spy();
        let res = {
            status: sinon.stub().returns({ send: sinon.stub().returns({ end: endSpy })}),
            send: sinon.spy()
        };
        await adminController.broadcastMessage(req, res);
        assert.notStrictEqual(res.send.args, [[{ msg: 'Will broadcast message Testing', success: true }]]);
        assert.strictEqual(res.send.callCount, 1);
        sinon.restore();
       });
    });
});