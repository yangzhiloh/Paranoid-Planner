// Main Express application entry point
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// checks to ensure the server is running properly
console.log('\n🔍 [SERVER] Starting ParanoidPlanner backend...');
console.log('.env file location:', path.resolve(__dirname, '.env'));
console.log('✓ NODE_ENV loaded:', !!process.env.NODE_ENV);
console.log('✓ PORT loaded:', !!process.env.PORT);

const express = require('express');
const cors = require('cors');

const app = express();

// Number of reverse proxies in front of the app (Render, plus Vercel when proxied through its rewrite),
// so req.ip is the real client IP for rate limiting.
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));

// Only the configured frontend may make credentialed cross-origin requests.
// Without FRONTEND_URL, allow the local Vite dev server outside production and no origins in production.
const allowedOrigin = process.env.FRONTEND_URL?.replace(/\/+$/, '')
  || (process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173');

if (!process.env.FRONTEND_URL) {
  console.warn('FRONTEND_URL is not set; CORS allows:', allowedOrigin || 'no cross-origin requests');
}

// Configure middleware
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// CSV imports arrive as raw text strings and JSON imports continue through express.json().
app.use('/api/modules/import', express.text({ type: ['text/csv', 'application/csv'] }));

// Importing database 
const pool = require('./config/db');
const runMigrations = require('./config/runMigrations');

// Import the needed routes for each page and each route handles Auth n authorisaation
const authRoutes = require('./routes/authRoutes');
const moduleRoutes = require('./routes/moduleRoutes');
const taskRoutes = require('./routes/taskRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const productivityRoutes = require('./routes/productivityRoutes');
const settingsRoutes = require('./routes/settingsRoutes');

// Register routes through these routes 
app.use('/api/auth', authRoutes);
app.use('/api/modules', moduleRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/productivity', productivityRoutes);
app.use('/api/settings', settingsRoutes);

// check that server is running
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Middleware to handle errors encountered
app.use((err, req, res, next) => {
  console.error('Error:', err.message);

  // Default gateway for  500 status code
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  res.status(status).json({
    error: message,
    status,
  });
});

// handle 404 errors
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method,
  });
});

// instructions to start the server
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const startServer = async () => {
  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET must be set');
    process.exitCode = 1;
    return;
  }

  try {
    // simple logging to confirm server is active
    await runMigrations(pool);
    app.listen(PORT, () => {
      console.log(`\n ParanoidPlanner backend server started`);
      console.log(` Environment: ${NODE_ENV}`);
      console.log(` Listening on http://localhost:${PORT}`);
      console.log(`\nAvailable endpoints:`);
      console.log(`  POST   /api/auth/register`);
      console.log(`  POST   /api/auth/login`);
      console.log(`  GET    /api/auth/me`);
      console.log(`  GET    /api/settings`);
      console.log(`  PUT    /api/settings`);
      console.log(`  GET    /api/health\n`);
    });
  } catch (err) {
    console.error('Failed to apply database migrations:', err.message);
    process.exitCode = 1;
  }
};

// Tests import the app without starting the server
if (require.main === module) {
  startServer();
}

module.exports = app;
