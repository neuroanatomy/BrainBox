const express = require('express');
const controller = require('./user.controller');

const router = new express.Router();

router.get('/json', controller.api_userAll);
router.get('/json/:userName', controller.validator, controller.api_user);
router.get('/json/:userName/files', controller.validator, controller.api_userFiles);
router.get('/json/:userName/atlas', controller.validator, controller.api_userAtlas);
router.get('/json/:userName/projects', controller.validator, controller.api_userProjects);
router.get('/:userName', controller.validator, controller.user);

module.exports = router;
