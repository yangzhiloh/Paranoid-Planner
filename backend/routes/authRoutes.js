// Authentication Routes
// POST /api/auth/register - Register a new user
// POST /api/auth/login - Login user (rate limited)
// GET /api/auth/me - Get current user info (requires auth)

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const { loginLimiter } = require('../middleware/rateLimiters');

// Register new user
router.post('/register', authController.register);

// Login user
router.post('/login', loginLimiter, authController.login);

// Get current user info (requires authentication)
router.get('/me', authMiddleware, authController.me);

module.exports = router;
