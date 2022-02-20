/*global authTokenMiddleware */

const express = require('express');
const Controller = require('./mri.controller');
const uploadController = require('./upload.controller');

const multer = require('multer');

const MriRouter = function(db) {

  const router = new express.Router();
  const controller = new Controller(db);

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

  return router;
};

module.exports = MriRouter;
