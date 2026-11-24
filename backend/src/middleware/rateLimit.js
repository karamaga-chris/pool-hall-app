const rateLimit = require('express-rate-limit');

const tooMany = { error: 'Too many attempts. Please wait 15 minutes and try again.' };

// Per-IP cap on login attempts (all phones combined).
const loginByIp = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany,
});

// Per-phone cap: stops a PIN being brute-forced from many IPs.
// Only failed attempts count, so a correct login never locks anyone out.
const loginByPhone = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `phone:${String(req.body?.phone || 'none').trim()}`,
  message: tooMany,
});

// Per-user cap on guessing the current PIN while changing it.
const changePinByUser = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `user:${req.user?.id || 'anon'}`,
  message: tooMany,
});

module.exports = { loginByIp, loginByPhone, changePinByUser };
