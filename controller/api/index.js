const path = require('path');
const express = require('express');
const { labelSetsRoute } = require('neuroweblab');
const controller = require('./api.controller');

const router = new express.Router();

// NeuroWebLab's labelSetsRoute (routes/labelSets.js): the *.json files of
// public/labels, by file name; an invalid file is skipped and logged
router.get('/getLabelsets', labelSetsRoute(path.join(__dirname, '../../public/labels')));
router.get('/userNameQuery', controller.userNameQuery);
router.get('/getAtlasBackups', controller.getAtlasBackups);
router.post('/log', controller.log);

module.exports = router;
