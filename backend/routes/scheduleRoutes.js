// Schedule Routes
// POST /api/schedule/generate - Generate a study schedule
// POST /api/schedule/generate-ai - Generate an AI-assisted study schedule
// GET /api/schedule - Get current schedule

const express = require('express');
const router = express.Router();
const scheduleController = require('../controllers/scheduleController');
const authMiddleware = require('../middleware/authMiddleware');

// Apply authMiddleware to all schedule routes
router.use(authMiddleware);

// Get current schedule
router.get('/', scheduleController.getSchedule);

// Generate new schedule
router.post('/generate', scheduleController.generateSchedule);

// Generate AI-assisted schedule
router.post('/generate-ai', scheduleController.generateAISchedule);

module.exports = router;
