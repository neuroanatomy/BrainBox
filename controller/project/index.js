/*global authTokenMiddleware */

const express = require('express');
const controller = require('./project.controller');

const router = new express.Router();

router.get('/new', controller.newProject);

router.get('/json', authTokenMiddleware, controller.apiProjectAll);
router.get('/json/:projectName', controller.validator, authTokenMiddleware, controller.apiProject);
router.get('/json/:projectName/files', controller.validator, authTokenMiddleware, controller.apiProjectFiles);
router.post('/json/:projectName', controller.validator, authTokenMiddleware, controller.postProject);
router.delete('/json/:projectName', controller.validator, authTokenMiddleware, controller.deleteProject);

router.get('/:projectName', controller.validator, controller.project);
router.get('/:projectName/settings', controller.validator, controller.settings);
router.get('/:projectName/embed', controller.validator, controller.embed);

module.exports = router;
