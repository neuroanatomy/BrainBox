const express = require('express');
const multer = require('multer');
const router = express.Router();

const controller = require('./mri.controller');
const uploadController = require('./upload.controller');

router.get('', controller.validator, controller.mri);
router.get('/json', controller.validator, tokenAuthentication, controller.api_mri_get);
router.post('/json', controller.validator_post, tokenAuthentication, controller.api_mri_post);

router.get('/upload', uploadController.token);
router.post('/upload',
	multer({dest: './tmp/'}).array('atlas'),
	uploadController.validator,
	uploadController.other_validations,
	uploadController.upload);

router.get('/reset', controller.reset);

module.exports = router;
