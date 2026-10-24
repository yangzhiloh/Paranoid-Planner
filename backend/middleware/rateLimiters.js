// Rate limiters for sensitive endpoints
const { rateLimit, MemoryStore } = require('express-rate-limit');

// Exported so tests can reset counters between cases.
const loginLimiterStore = new MemoryStore();

// 5 login attempts per IP per 15 minutes.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: loginLimiterStore,
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json({
      error: 'Too many login attempts. Please try again later.',
    });
  },
});

module.exports = {
  loginLimiter,
  loginLimiterStore,
};
