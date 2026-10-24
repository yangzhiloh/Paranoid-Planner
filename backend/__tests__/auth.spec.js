const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const app = require('../server');
const pool = require('../config/db');
const runMigrations = require('../config/runMigrations');
const { loginLimiterStore } = require('../middleware/rateLimiters');
const { hashToken } = require('../services/tokenService');

const EMAIL_DOMAIN = '@auth-spec.test';
const PASSWORD = 'correct-horse-battery';

// Return the refresh_token cookie value and its attributes from a response
const getRefreshCookie = (res) => {
  const header = (res.headers['set-cookie'] || []).find((cookie) => cookie.startsWith('refresh_token='));
  if (!header) return null;
  return { value: header.split(';')[0].slice('refresh_token='.length), header };
};

const cookieHeader = (token) => `refresh_token=${token}`;

const createUser = async () => {
  const email = `user-${crypto.randomUUID()}${EMAIL_DOMAIN}`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Spec User', email, password: PASSWORD });
  expect(res.status).toBe(201);
  return { email, id: res.body.user.id, token: res.body.token, refresh: getRefreshCookie(res).value };
};

const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });

const refresh = (token) => request(app).post('/api/auth/refresh').set('Cookie', cookieHeader(token));

const storedToken = async (token) => {
  const result = await pool.query(
    'SELECT family_id, revoked_at FROM refresh_tokens WHERE token_hash = $1',
    [hashToken(token)]
  );
  return result.rows[0];
};

beforeAll(async () => {
  await runMigrations(pool);
});

beforeEach(async () => {
  await loginLimiterStore.resetAll();
});

afterAll(async () => {
  // refresh_tokens rows are removed by ON DELETE CASCADE
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`%${EMAIL_DOMAIN}`]);
  await pool.end();
});

describe('POST /api/auth/login', () => {
  test('succeeds with valid credentials and sets a hardened refresh cookie', async () => {
    const user = await createUser();

    const res = await login(user.email, PASSWORD);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: 'Login successful',
      token: expect.any(String),
      user: { id: user.id, name: 'Spec User', email: user.email },
    });

    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    expect(decoded.id).toBe(user.id);
    expect(decoded.exp - decoded.iat).toBe(15 * 60);

    const cookie = getRefreshCookie(res);
    expect(cookie.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookie.header).toMatch(/HttpOnly/i);
    expect(cookie.header).toMatch(/SameSite=Strict/i);
    expect(cookie.header).toMatch(/Path=\/api\/auth/);
    expect(cookie.header).toMatch(/Max-Age=604800/);

    // Only the hash is stored
    expect(await storedToken(cookie.value)).toBeDefined();
    const raw = await pool.query('SELECT 1 FROM refresh_tokens WHERE token_hash = $1', [cookie.value]);
    expect(raw.rowCount).toBe(0);
  });

  test('fails with the same 401 for a wrong password and an unknown email', async () => {
    const user = await createUser();

    const wrongPassword = await login(user.email, 'wrong-password');
    const unknownEmail = await login(`nobody-${crypto.randomUUID()}${EMAIL_DOMAIN}`, PASSWORD);

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual({ error: 'Invalid email or password' });
    expect(unknownEmail.body).toEqual(wrongPassword.body);
    expect(getRefreshCookie(wrongPassword)).toBeNull();
    expect(getRefreshCookie(unknownEmail)).toBeNull();
  });

  test('rate limit trips on the 6th attempt', async () => {
    const user = await createUser();

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const res = await login(user.email, 'wrong-password');
      expect(res.status).toBe(401);
    }

    const blocked = await login(user.email, PASSWORD);

    expect(blocked.status).toBe(429);
    expect(blocked.headers['content-type']).toMatch(/application\/json/);
    expect(blocked.body).toEqual({ error: 'Too many login attempts. Please try again later.' });
    expect(blocked.headers.ratelimit).toBeDefined();
    expect(blocked.headers['ratelimit-policy']).toBeDefined();
    expect(blocked.headers['x-ratelimit-limit']).toBeUndefined();
  });
});

describe('POST /api/auth/refresh', () => {
  test('rotation issues a new refresh token and access token, and revokes the old one', async () => {
    const user = await createUser();

    const res = await refresh(user.refresh);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: 'Token refreshed',
      token: expect.any(String),
      user: { id: user.id, name: 'Spec User', email: user.email },
    });

    const rotated = getRefreshCookie(res).value;
    expect(rotated).not.toBe(user.refresh);

    const oldRow = await storedToken(user.refresh);
    const newRow = await storedToken(rotated);
    expect(oldRow.revoked_at).not.toBeNull();
    expect(newRow.revoked_at).toBeNull();
    expect(newRow.family_id).toBe(oldRow.family_id);

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(user.id);
  });

  test('reusing an old refresh token revokes the whole family', async () => {
    const user = await createUser();

    const first = await refresh(user.refresh);
    const second = await refresh(getRefreshCookie(first).value);
    const latest = getRefreshCookie(second).value;

    const reuse = await refresh(user.refresh);

    expect(reuse.status).toBe(401);
    expect(getRefreshCookie(reuse).header).toMatch(/Expires=Thu, 01 Jan 1970/);

    const familyId = (await storedToken(user.refresh)).family_id;
    const active = await pool.query(
      'SELECT COUNT(*)::int AS count FROM refresh_tokens WHERE family_id = $1 AND revoked_at IS NULL',
      [familyId]
    );
    expect(active.rows[0].count).toBe(0);

    // The legitimate holder's newest token no longer works
    const afterReuse = await refresh(latest);
    expect(afterReuse.status).toBe(401);
  });

  test('reuse detection leaves other sessions of the same user alive', async () => {
    const user = await createUser();
    const otherSession = getRefreshCookie(await login(user.email, PASSWORD)).value;

    await refresh(user.refresh);
    await refresh(user.refresh);

    const res = await refresh(otherSession);
    expect(res.status).toBe(200);
  });

  test('rejects a missing or unknown refresh token', async () => {
    const missing = await request(app).post('/api/auth/refresh');
    const unknown = await refresh(crypto.randomBytes(32).toString('base64url'));

    expect(missing.status).toBe(401);
    expect(unknown.status).toBe(401);
  });

  test('rejects an expired refresh token', async () => {
    const user = await createUser();
    await pool.query(
      "UPDATE refresh_tokens SET expires_at = NOW() - INTERVAL '1 second' WHERE token_hash = $1",
      [hashToken(user.refresh)]
    );

    const res = await refresh(user.refresh);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  test('revokes the current refresh token and clears the cookie', async () => {
    const user = await createUser();

    const res = await request(app).post('/api/auth/logout').set('Cookie', cookieHeader(user.refresh));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Logged out' });

    const cleared = getRefreshCookie(res);
    expect(cleared.value).toBe('');
    expect(cleared.header).toMatch(/Path=\/api\/auth/);
    expect(cleared.header).toMatch(/Expires=Thu, 01 Jan 1970/);

    expect((await storedToken(user.refresh)).revoked_at).not.toBeNull();
    expect((await refresh(user.refresh)).status).toBe(401);
  });
});

describe('access token verification', () => {
  test('rejects an expired access token', async () => {
    const user = await createUser();
    const expired = jwt.sign(
      { id: user.id, exp: Math.floor(Date.now() / 1000) - 10 },
      process.env.JWT_SECRET,
      { algorithm: 'HS256' }
    );

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Token has expired' });
  });

  test.each(['HS384', 'HS512'])('rejects a token signed with %s', async (algorithm) => {
    const user = await createUser();
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { algorithm, expiresIn: '15m' });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid token' });
  });

  test('rejects an unsigned token (alg "none")', async () => {
    const user = await createUser();
    const token = jwt.sign({ id: user.id }, null, { algorithm: 'none', expiresIn: '15m' });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });

  test('accepts a valid HS256 access token', async () => {
    const user = await createUser();

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${user.token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
  });
});
