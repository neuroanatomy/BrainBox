var express = require('express');
var controller = require('./api.controller');

var router = new express.Router();

router.get('/getLabelsets', controller.getLabelsets);
router.get('/userNameQuery', controller.userNameQuery);
router.get('/getAtlasBackups', controller.getAtlasBackups);
router.get('/log', controller.log);

module.exports = router;
