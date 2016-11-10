var express = require('express');
var controller = require('./user.controller');

var router = express.Router();

router.get('/:userName', controller.validator , controller.user);
router.get('/json/:userName', controller.validator , controller.api_user);
router.get('/json/:userName/files', controller.validator , controller.api_userFiles);
router.get('/json/:userName/atlas', controller.validator , controller.api_userAtlas);
router.get('/json/:userName/projects', controller.validator , controller.api_userProjects);


module.exports = router;