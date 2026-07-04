// Settings Routes
// GET /api/settings - Get current user's settings
// PUT /api/settings - Update current user's settings

const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', settingsController.getSettings);
router.put('/', settingsController.updateSettings);

module.exports = router;
