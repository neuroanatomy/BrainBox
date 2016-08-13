var express = require('express');
var controller = require('./project.controller');

var router = express.Router();

//
router.get('/:projectName', controller.validator , controller.project);
router.get('/json/:projectName', controller.validator , controller.api_project);


module.exports = router;