/*global authTokenMiddleware */

var express = require('express');
var controller = require('./mri.controller');
var uploadController = require('./upload.controller');

var multer = require('multer');
var router = new express.Router();

router.get('', controller.validator, controller.mri);
router.get('/json', controller.validator, authTokenMiddleware, controller.apiMriGet);
router.post('/json', controller.validatorPost, authTokenMiddleware, controller.apiMriPost);

router.get('/upload', uploadController.token);

router.post('/upload',
  multer({ dest: './tmp/'}).array('atlas'),
  uploadController.validator,
  uploadController.otherValidations,
  uploadController.upload);

router.get('/reset', controller.reset);

module.exports = router;
