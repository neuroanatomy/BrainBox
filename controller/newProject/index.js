var express = require('express');
var controller = require('./newProject.controller');

var router = express.Router();

router.get('/:projectName', controller.validator , controller.newProject);


module.exports = router;