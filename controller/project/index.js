var express = require('express');
var controller = require('./project.controller');

var router = express.Router();

//
router.get('/new', controller.newProject);

router.get('/json', controller.api_projectAll);
router.get('/json/:projectName', controller.validator , controller.api_project);
router.get('/json/:projectName/files', controller.validator , controller.api_projectFiles);
router.post('/json/:projectName', controller.validator, controller.post_project);
router.delete('/json/:projectName', controller.validator, controller.delete_project);

router.get('/:projectName', controller.validator , controller.project);
router.get('/:projectName/settings', controller.validator , controller.settings);

module.exports = router;