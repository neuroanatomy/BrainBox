var express = require('express');
var controller = require('./mri.controller');
var upload_controller = require('./upload.controller');

var multer = require('multer');
var router = express.Router();

router.get('', controller.validator, controller.mri);
router.post('/json', controller.validator_post, controller.api_mri_post);
router.get('/json', controller.validator, controller.api_mri_get);

router.get('/upload', upload_controller.token);

router.post('/upload',
	multer({ dest: './tmp/'}).array('atlas'),
	upload_controller.validator,
	upload_controller.other_validations,
	upload_controller.upload);

module.exports = router;