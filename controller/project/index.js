var express = require('express');
var controller = require('./project.controller');

var router = express.Router();

//
router.get('/new', controller.newProject);
router.get('/:projectName', controller.validator , controller.project);
router.get('/:projectName/settings', controller.validator , controller.settings);
router.get('/json/:projectName', controller.validator , controller.api_project);
router.post('/json/:projectName', controller.validator, controller.post_project);

module.exports = router;