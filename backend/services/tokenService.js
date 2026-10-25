// Access and refresh token helpers
// Access tokens are short-lived JWTs held in frontend memory.
// Refresh tokens are random values sent as an httpOnly cookie; only their SHA-256 hash is stored.

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_COOKIE_NAME = 'refresh_token';

const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/auth',
});

const generateAccessToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: ACCESS_TOKEN_TTL,
  });

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Create a refresh token in the given family (a new family when none is given) and return the raw value.
const issueRefreshToken = async (userId, familyId = crypto.randomUUID(), db = pool) => {
  const token = crypto.randomBytes(32).toString('base64url');

  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
     VALUES ($1, $2, $3, NOW() + ($4 * INTERVAL '1 millisecond'))`,
    [userId, hashToken(token), familyId, REFRESH_TOKEN_TTL_MS]
  );

  return token;
};

const setRefreshCookie = (res, token) => {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...refreshCookieOptions(),
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
};

const clearRefreshCookie = (res) => {
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
};

const revokeFamily = (familyId, db = pool) =>
  db.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = $1 AND revoked_at IS NULL',
    [familyId]
  );

// Rotate a presented refresh token.
// Returns { userId, refreshToken } on success, or null when the token is unknown, expired or reused.
// Presenting an already-revoked token revokes its whole family.
const rotateRefreshToken = async (presentedToken) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock the row so concurrent refreshes with the same token are serialised
    const result = await client.query(
      `SELECT id, user_id, family_id, revoked_at, expires_at <= NOW() AS expired
       FROM refresh_tokens
       WHERE token_hash = $1
       FOR UPDATE`,
      [hashToken(presentedToken)]
    );
    const stored = result.rows[0];

    if (!stored) {
      await client.query('ROLLBACK');
      return null;
    }

    if (stored.revoked_at) {
      await revokeFamily(stored.family_id, client);
      await client.query('COMMIT');
      return null;
    }

    if (stored.expired) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [stored.id]);
    const refreshToken = await issueRefreshToken(stored.user_id, stored.family_id, client);
    await client.query('COMMIT');

    return { userId: stored.user_id, refreshToken };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const revokeRefreshToken = (token) =>
  pool.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
    [hashToken(token)]
  );

module.exports = {
  REFRESH_COOKIE_NAME,
  generateAccessToken,
  hashToken,
  issueRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  rotateRefreshToken,
  revokeRefreshToken,
};
