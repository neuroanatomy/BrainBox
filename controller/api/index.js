/* eslint-disable prefer-exponentiation-operator */
var express = require('express');
var controller = require('./api.controller');

// eslint-disable-next-line new-cap
var router = express.Router();

router.get('/getLabelsets', controller.getLabelsets);
router.get('/userNameQuery', controller.userNameQuery);
router.get('/getAtlasBackups', controller.getAtlasBackups);
router.get('/log', controller.log);

module.exports = router;
