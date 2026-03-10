// src/server.js
// Point d'entrée principal - Serveur Express sécurisé
'use strict';

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const { pool } = require('../config/database');

// Routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const apiRoutes = require('./routes/api');

// Middleware custom
const { requireAuth } = require('./middleware/auth');
const { globalRateLimit, authRateLimit } = require('./middleware/rateLimiter');
const { securityLogger } = require('./middleware/logger');

const app = express();

// ============================================
// 1. SÉCURITÉ - Headers HTTP (Helmet)
// ============================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https://openweathermap.org"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  // Force HTTPS si en production
  hsts: process.env.NODE_ENV === 'production' ? {
    maxAge: 31536000,
    includeSubDomains: true
  } : false,
}));

// Empêche le fingerprinting du serveur
app.disable('x-powered-by');

// ============================================
// 2. RATE LIMITING - Protection brute force
// ============================================
app.use(globalRateLimit);

// ============================================
// 3. PARSING - Corps des requêtes
// ============================================
app.use(express.json({ limit: '10kb' })); // Limite taille payload
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ============================================
// 4. SESSIONS - Stockage PostgreSQL
// ============================================
app.use(session({
  store: new pgSession({
    pool,
    tableName: 'sessions',
    createTableIfMissing: true,
    pruneSessionInterval: 60 * 60 // Nettoyage toutes les heures
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: 'sid', // Ne pas exposer que c'est express-session
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true, // Inaccessible via JavaScript
    maxAge: parseInt(process.env.SESSION_MAX_AGE) || 28800000, // 8h
    sameSite: 'strict' // Protection CSRF
  }
}));

// ============================================
// 5. LOGGING - Sécurité et audit
// ============================================
app.use(securityLogger);

// ============================================
// 6. FICHIERS STATIQUES
// ============================================
app.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: true,
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
}));

// ============================================
// 7. TEMPLATE ENGINE
// ============================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// Variables globales pour les templates
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.nodeEnv = process.env.NODE_ENV;
  next();
});

// ============================================
// 8. ROUTES
// ============================================

// Page d'accueil - redirige vers login ou dashboard
app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.redirect('/login');
});

// Auth (login/logout) - avec rate limiting spécifique
app.use('/', authRateLimit, authRoutes);

// Dashboard - protégé par middleware d'auth
app.use('/dashboard', requireAuth, dashboardRoutes);

// API - protégée par middleware d'auth
app.use('/api', requireAuth, apiRoutes);

// ============================================
// 9. GESTION DES ERREURS
// ============================================

// 404
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page introuvable',
    code: 404,
    message: 'La page que vous cherchez n\'existe pas.'
  });
});

// 500 - Ne pas exposer les détails en production
app.use((err, req, res, next) => {
  console.error('❌ Erreur serveur:', err.stack);
  
  const isDev = process.env.NODE_ENV === 'development';
  res.status(err.status || 500).render('error', {
    title: 'Erreur serveur',
    code: err.status || 500,
    message: isDev ? err.message : 'Une erreur interne est survenue.',
    stack: isDev ? err.stack : null
  });
});

// ============================================
// 10. DÉMARRAGE
// ============================================
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`\n🚀 Dashboard Pi démarré`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Réseau:  http://<IP_RPI>:${PORT}`);
  console.log(`   Mode:    ${process.env.NODE_ENV || 'development'}`);
  console.log(`   PID:     ${process.pid}\n`);
});

// Arrêt propre (PM2, Ctrl+C)
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
  console.log('\n⏳ Arrêt en cours...');
  pool.end(() => {
    console.log('✅ Pool PostgreSQL fermé');
    process.exit(0);
  });
}

module.exports = app;
