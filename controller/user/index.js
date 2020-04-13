var express = require('express');
var controller = require('./user.controller');

var router = express.Router();

router.get('/json', controller.apiUserAll);
router.get('/json/:userName', controller.validator, controller.apiUser);
router.get('/json/:userName/files', controller.validator, controller.apiUserFiles);
router.get('/json/:userName/atlas', controller.validator, controller.apiUserAtlas);
router.get('/json/:userName/projects', controller.validator, controller.apiUserProjects);
router.get('/:userName', controller.validator, controller.user);


module.exports = router;
