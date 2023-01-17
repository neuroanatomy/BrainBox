const express = require('express');
const controller = require('./admin.controller');
const router = new express.Router();

router.post('/save-all-atlases', controller.validator, controller.saveAllAtlases);
router.post('/broadcast-message', controller.validator, controller.broadcastMessage);

module.exports = router;
