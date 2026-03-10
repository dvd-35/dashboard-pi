// src/routes/auth.js
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const { query } = require('../../config/database');
const { redirectIfAuthenticated } = require('../middleware/auth');
const { logSecurity } = require('../middleware/logger');

// GET /login
router.get('/login', redirectIfAuthenticated, (req, res) => {
  res.render('login', {
    title: 'Connexion',
    error: null,
    expired: req.query.expired === '1',
    blocked: false
  });
});

// POST /login
router.post('/login', redirectIfAuthenticated, [
  body('username').trim().isLength({ min: 1, max: 50 }).escape(),
  body('password').isLength({ min: 1, max: 100 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('login', {
      title: 'Connexion',
      error: 'Identifiants invalides.',
      expired: false,
      blocked: false
    });
  }

  const { username, password } = req.body;

  try {
    const result = await query(
      'SELECT id, username, password_hash, is_active FROM users WHERE username = $1 LIMIT 1',
      [username.toLowerCase()]
    );

    // Protection timing attack : on compare toujours un hash même si l'utilisateur n'existe pas
    const DUMMY_HASH = '$2a$12$dummyhashfortimingprotectionXXXXXXXXXXXXXXXXXXXXXXXXX';
    const storedHash = result.rows[0]?.password_hash || DUMMY_HASH;
    const passwordMatch = await bcrypt.compare(password, storedHash);

    if (!result.rows[0] || !passwordMatch || !result.rows[0].is_active) {
      logSecurity('LOGIN_FAILED', { username, ip: req.ip });
      return res.render('login', {
        title: 'Connexion',
        error: 'Identifiants incorrects.',
        expired: false,
        blocked: false
      });
    }

    const user = result.rows[0];

    req.session.regenerate((err) => {
      if (err) {
        console.error('Erreur régénération session:', err);
        return res.render('login', {
          title: 'Connexion',
          error: 'Erreur de connexion, réessayez.',
          expired: false,
          blocked: false
        });
      }

      req.session.user = {
        id: user.id,
        username: user.username,
        loginAt: Date.now()
      };

      logSecurity('LOGIN_SUCCESS', { username: user.username, ip: req.ip });
      query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]).catch(console.error);

      const returnTo = req.session.returnTo || '/dashboard';
      delete req.session.returnTo;
      res.redirect(returnTo);
    });

  } catch (err) {
    console.error('Erreur login:', err);
    res.render('login', {
      title: 'Connexion',
      error: 'Erreur serveur. Réessayez.',
      expired: false,
      blocked: false
    });
  }
});

// POST /logout
router.post('/logout', (req, res) => {
  const username = req.session?.user?.username;
  req.session.destroy((err) => {
    if (err) console.error('Erreur logout:', err);
    if (username) logSecurity('LOGOUT', { username, ip: req.ip });
    res.clearCookie('sid');
    res.redirect('/login');
  });
});

module.exports = router;
