/* eslint-disable prefer-exponentiation-operator */
/* eslint-disable new-cap */
/* eslint-disable no-undef */
var express = require('express');
var controller = require('./project.controller');

var router = express.Router();

router.get('/new', controller.newProject);

router.get('/json', authTokenMiddleware, controller.api_projectAll);
router.get('/json/:projectName', controller.validator, authTokenMiddleware, controller.api_project);
router.get('/json/:projectName/files', controller.validator, authTokenMiddleware, controller.api_projectFiles);
router.post('/json/:projectName', controller.validator, authTokenMiddleware, controller.post_project);
router.delete('/json/:projectName', controller.validator, authTokenMiddleware, controller.delete_project);

router.get('/:projectName', controller.validator, controller.project);
router.get('/:projectName/settings', controller.validator, controller.settings);

module.exports = router;
