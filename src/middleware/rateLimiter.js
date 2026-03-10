// src/middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Trop de requêtes, veuillez réessayer plus tard.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/css') || req.path.startsWith('/js') || req.path.startsWith('/images')
});

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method !== 'POST' || req.path !== '/login',
  handler: (req, res) => {
    console.warn(`🚨 Rate limit auth dépassé depuis ${req.ip}`);
    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.status(429).json({
        success: false,
        error: 'Compte temporairement bloqué. Réessayez dans 15 minutes.'
      });
    }
    res.status(429).render('login', {
      title: 'Connexion',
      error: 'Trop de tentatives. Veuillez patienter 15 minutes.',
      expired: false,
      blocked: true
    });
  }
});

const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Limite API atteinte.' },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = { globalRateLimit, authRateLimit, apiRateLimit };
