// Point the app at a dedicated test database before any module loads backend/.env.
// dotenv never overrides variables that are already set, so these take precedence.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-0123456789abcdef0123456789abcdef';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.DATABASE_URL = '';
process.env.DB_HOST = process.env.TEST_DB_HOST || 'localhost';
process.env.DB_PORT = process.env.TEST_DB_PORT || '5432';
process.env.DB_USER = process.env.TEST_DB_USER || 'planner';
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || 'planner';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'paranoid_planner_test';

// The suite writes to the database, so refuse to run against anything but a *_test database.
if (!process.env.DB_NAME.endsWith('_test')) {
  throw new Error(`Refusing to run auth tests against non-test database "${process.env.DB_NAME}"`);
}
