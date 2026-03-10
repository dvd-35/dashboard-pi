// src/server.js
'use strict';

require('dotenv').config();
const express = require('express');
const https = require('https');
const fs = require('fs');
const helmet = require('helmet');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const { pool } = require('../config/database');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const apiRoutes = require('./routes/api');

const { requireAuth } = require('./middleware/auth');
const { globalRateLimit, authRateLimit } = require('./middleware/rateLimiter');
const { securityLogger } = require('./middleware/logger');

const app = express();

// ============================================
// 1. SÉCURITÉ - Headers HTTP
// ============================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https://www.google.com"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true
  }
}));

app.disable('x-powered-by');

// ============================================
// 2. RATE LIMITING
// ============================================
app.use(globalRateLimit);

// ============================================
// 3. PARSING
// ============================================
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ============================================
// 4. SESSIONS
// ============================================
app.use(session({
  store: new pgSession({
    pool,
    tableName: 'sessions',
    createTableIfMissing: true,
    pruneSessionInterval: 3600
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: 'sid',
  cookie: {
    secure: true,       // Toujours true car on est en HTTPS
    httpOnly: true,
    maxAge: parseInt(process.env.SESSION_MAX_AGE) || 28800000,
    sameSite: 'strict'
  }
}));

// ============================================
// 5. LOGGING
// ============================================
app.use(securityLogger);

// ============================================
// 6. FICHIERS STATIQUES
// ============================================
app.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: true,
  maxAge: '1d'
}));

// ============================================
// 7. TEMPLATE ENGINE
// ============================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// Variables globales pour tous les templates
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.nodeEnv = process.env.NODE_ENV;
  next();
});

// ============================================
// 8. ROUTES
// ============================================
app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.redirect('/login');
});

app.use('/', authRateLimit, authRoutes);
app.use('/dashboard', requireAuth, dashboardRoutes);
app.use('/api', requireAuth, apiRoutes);

// ============================================
// 9. GESTION DES ERREURS
// ============================================

// 404
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page introuvable',
    code: 404,
    message: "La page que vous cherchez n'existe pas.",
    stack: null
  });
});

// 500
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
// 10. DÉMARRAGE HTTPS
// ============================================
const PORT = process.env.PORT || 3000;
const SSL_KEY = process.env.SSL_KEY || './certs/key.pem';
const SSL_CERT = process.env.SSL_CERT || './certs/cert.pem';

try {
  const sslOptions = {
    key: fs.readFileSync(path.resolve(SSL_KEY)),
    cert: fs.readFileSync(path.resolve(SSL_CERT))
  };

  https.createServer(sslOptions, app).listen(PORT, '0.0.0.0', () => {
    console.log(`\n🔒 Dashboard Pi démarré en HTTPS`);
    console.log(`   Local:  https://localhost:${PORT}`);
    console.log(`   Réseau: https://<IP_RPI>:${PORT}`);
    console.log(`   Mode:   ${process.env.NODE_ENV || 'development'}`);
    console.log(`   PID:    ${process.pid}\n`);
  });
} catch (err) {
  // Fallback HTTP si les certificats sont absents (développement)
  console.warn('\n⚠️  Certificats SSL introuvables, démarrage en HTTP (non sécurisé)');
  console.warn('   Génère les certificats avec : npm run gencert\n');

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Dashboard Pi démarré en HTTP`);
    console.log(`   Local:  http://localhost:${PORT}`);
    console.log(`   Mode:   ${process.env.NODE_ENV || 'development'}\n`);
  });
}

// Arrêt propre
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
