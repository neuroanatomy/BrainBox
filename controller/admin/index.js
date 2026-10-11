const express = require('express');
const controller = require('./admin.controller');
const router = new express.Router();

/* global authTokenMiddleware */
router.get('', authTokenMiddleware, controller.adminPage);
router.get('/json/orphans', authTokenMiddleware, controller.requireAdmin, controller.getOrphans);
router.post('/json/orphans/remove', authTokenMiddleware, controller.requireAdmin, controller.removeOrphans);
router.get('/json/mri', authTokenMiddleware, controller.requireAdmin, controller.getMRI);
router.post('/json/mri/remove-annotations', authTokenMiddleware, controller.requireAdmin, controller.removeMRIAnnotations);
router.get('/json/projects/damaged', authTokenMiddleware, controller.requireAdmin, controller.getDamagedProjects);
router.post('/json/projects/restore-files', authTokenMiddleware, controller.requireAdmin, controller.restoreProjectFiles);
router.post('/json/projects/fix-current', authTokenMiddleware, controller.requireAdmin, controller.fixProjectCurrentVersions);

router.post('/save-all-atlases', authTokenMiddleware, controller.validator, controller.saveAllAtlases);
router.post('/broadcast-message', authTokenMiddleware, controller.validator, controller.broadcastMessage);

module.exports = router;
