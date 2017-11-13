const express = require('express');
const multer = require('multer');
const router = express.Router();

const controller = require('./mri.controller');
const uploadController = require('./upload.controller');

router.get('', controller.validator, controller.mri);
router.get('/json', controller.validator, tokenAuthentication, controller.apiMriGet);
router.post('/json', controller.validatorPost, tokenAuthentication, controller.apiMriPost);

router.get('/upload', uploadController.token);
router.post('/upload',
    multer({dest: './tmp/'}).array('atlas'),
    uploadController.validator,
    uploadController.other_validations,
    uploadController.upload);

router.get('/reset', controller.reset);

module.exports = router;
