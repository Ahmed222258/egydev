const express = require('express');
const router = express.Router();
const teamController = require('../controller/team.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { upload } = require('../middleware/upload.middleware');
const { validateTeam } = require('../middleware/validate.middleware');

// Public
router.get('/', teamController.getAllTeams);
router.get('/:id', teamController.getTeamById);

// Admin / Manager only
router.post('/', authenticate, authorize('admin', 'manager'), upload.single('logo'), validateTeam, teamController.createTeam);
router.put('/:id', authenticate, authorize('admin', 'manager'), upload.single('logo'), validateTeam, teamController.updateTeam);
router.delete('/:id', authenticate, authorize('admin'), teamController.deleteTeam);

module.exports = router;
