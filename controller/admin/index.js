var express = require('express');
var controller = require('./admin.controller');
var router = new express.Router();

router.post('/save-all-atlases', controller.validator, controller.saveAllAtlases);
router.post('/broadcast-message', controller.validator, controller.broadcastMessage);

module.exports = router;
