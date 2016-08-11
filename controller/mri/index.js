var express = require('express');
var controller = require('./mri-download.controller');

var router = express.Router();

//
router.get('', controller.validator , controller.download);
router.get('/json', controller.validator , controller.api_download);


module.exports = router;