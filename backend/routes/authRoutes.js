// Authentication Routes
// POST /api/auth/register - Register a new user
// POST /api/auth/login - Login user (rate limited)
// POST /api/auth/refresh - Rotate the refresh cookie and get a new access token
// POST /api/auth/logout - Revoke the refresh cookie
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

// Rotate refresh token (reads the httpOnly refresh_token cookie)
router.post('/refresh', authController.refresh);

// Revoke refresh token and clear cookie
router.post('/logout', authController.logout);

// Get current user info (requires authentication)
router.get('/me', authMiddleware, authController.me);

module.exports = router;
