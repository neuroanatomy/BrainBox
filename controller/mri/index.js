var express = require('express');
var controller = require('./mri.controller');

var router = express.Router();

//
router.get('', controller.validator , controller.mri);
router.get('/json', controller.validator , controller.api_mri);


module.exports = router;