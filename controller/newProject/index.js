var express = require('express');
var controller = require('./newProject.controller');

var router = express.Router();

router.get('/', controller.validator , controller.newProject);


module.exports = router;