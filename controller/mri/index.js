var express = require('express');
var controller = require('./mri.controller');
var upload_controller = require('./upload.controller');

var multer = require('multer');
var router = express.Router();

router.get('', controller.validator, controller.mri);
router.get('/json', controller.validator, tokenAuthentication, controller.apiMriGet);
router.post('/json', controller.validatorPost, tokenAuthentication, controller.apiMriPost);

router.get('/upload', upload_controller.token);

router.post('/upload',
	multer({ dest: './tmp/'}).array('atlas'),
	upload_controller.validator,
	upload_controller.other_validations,
	upload_controller.upload);

router.get('/reset', controller.reset);

module.exports = router;
