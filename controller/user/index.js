var express = require('express');
var controller = require('./user.controller');

var router = express.Router();

router.get('/:userName', controller.validator , controller.user);
router.get('/json/:userName', controller.validator , controller.api_user);


module.exports = router;