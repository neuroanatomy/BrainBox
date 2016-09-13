var express = require('express');
var controller = require('./mri.controller');
var upload_controller = require('./upload.controller');

var multer = require('multer');
var router = express.Router();

router.get('', controller.validator, controller.mri);
router.get('/json', controller.validator, controller.api_mri);

router.get('/upload', upload_controller.token);

router.post('', function(req, res){
	console.log(req.isAuthenticated() ? req.username : "unknown user");

	console.log(req);
})

router.post('/upload',
	multer({ dest: './tmp/'}).array('atlas'),
	upload_controller.validator,
	upload_controller.other_validations,
	upload_controller.upload);

module.exports = router;