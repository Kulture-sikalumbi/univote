// src/middleware/rateLimiter.ts
import rateLimit from 'express-rate-limit';

// Brute-force protection on credential login/registration endpoints.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

// Looser default limiter for general API traffic.
export const defaultRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
