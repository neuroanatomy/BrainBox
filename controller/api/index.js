const express = require('express');
const controller = require('./api.controller');

const router = new express.Router();

router.get('/getLabelsets', controller.getLabelsets);
router.get('/userNameQuery', controller.userNameQuery);
router.get('/getAtlasBackups', controller.getAtlasBackups);
router.post('/log', controller.log);

module.exports = router;
