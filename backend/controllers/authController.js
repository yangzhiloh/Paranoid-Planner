// Authentication Controller
// Handles user registration, login, session refresh, logout, and profile retrieval

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const {
  REFRESH_COOKIE_NAME,
  generateAccessToken,
  issueRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  rotateRefreshToken,
  revokeRefreshToken,
} = require('../services/tokenService');

const BCRYPT_ROUNDS = 10;

// Compared against when the email is unknown so login takes the same time either way.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS);

// Start a new session: set a refresh cookie in a new family and return a short-lived access token.
const startSession = async (res, userId) => {
  const refreshToken = await issueRefreshToken(userId);
  setRefreshCookie(res, refreshToken);
  return generateAccessToken(userId);
};

// Register a new user
const register = async (req, res) => {
  try {
    const { email, name, password } = req.body;

    // Validate input
    if (!email || !name || !password) {
      return res.status(400).json({ error: 'Email, name, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const userExists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);

    if (userExists.rows.length > 0) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Insert user into database
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
      [name, email, hashedPassword]
    );

    const newUser = result.rows[0];

    const token = await startSession(res, newUser.id);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
      },
    });
  } catch (err) {
    console.error('Registration error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user by email
    const result = await pool.query('SELECT id, name, email, password_hash FROM users WHERE email = $1', [email]);

    const user = result.rows[0];

    // Always run bcrypt, even for unknown emails, so response time does not reveal which emails exist
    const isPasswordValid = await bcrypt.compare(
      String(password),
      user ? user.password_hash : DUMMY_PASSWORD_HASH
    );

    if (!user || !isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = await startSession(res, user.id);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
};

// Exchange the refresh cookie for a new access token and a rotated refresh cookie
const refresh = async (req, res) => {
  try {
    const presentedToken = req.cookies?.[REFRESH_COOKIE_NAME];

    if (!presentedToken) {
      return res.status(401).json({ error: 'No refresh token provided' });
    }

    const rotated = await rotateRefreshToken(presentedToken);

    if (!rotated) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const result = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [rotated.userId]);
    const user = result.rows[0];

    setRefreshCookie(res, rotated.refreshToken);

    res.json({
      message: 'Token refreshed',
      token: generateAccessToken(user.id),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error('Refresh error:', err.message);
    res.status(500).json({ error: 'Token refresh failed' });
  }
};

// Revoke the current refresh token and clear its cookie
const logout = async (req, res) => {
  try {
    const presentedToken = req.cookies?.[REFRESH_COOKIE_NAME];

    if (presentedToken) {
      await revokeRefreshToken(presentedToken);
    }

    clearRefreshCookie(res);
    res.json({ message: 'Logged out' });
  } catch (err) {
    console.error('Logout error:', err.message);
    res.status(500).json({ error: 'Logout failed' });
  }
};

// Get current user info
const me = async (req, res) => {
  try {
    // req.user is set by authMiddleware
    const userId = req.user.id;

    // Fetch user details from database
    const result = await pool.query(
      'SELECT id, name, email, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      user,
    });
  } catch (err) {
    console.error('Get user error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve user information' });
  }
};

module.exports = {
  register,
  login,
  refresh,
  logout,
  me,
};
