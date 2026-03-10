// src/middleware/rateLimiter.js
// Protection contre les attaques par force brute et DDoS
const rateLimit = require('express-rate-limit');

// Limite globale : 100 requêtes / 15 minutes par IP
const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Trop de requêtes, veuillez réessayer plus tard.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Ne pas limiter les fichiers statiques
    return req.path.startsWith('/css') || 
           req.path.startsWith('/js') || 
           req.path.startsWith('/images');
  }
});

// Limite pour l'authentification : 5 tentatives / 15 minutes
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  // Seulement sur les routes POST de login
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
      blocked: true
    });
  }
});

// Limite pour l'API : 60 requêtes / minute
const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Limite API atteinte.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { globalRateLimit, authRateLimit, apiRateLimit };
