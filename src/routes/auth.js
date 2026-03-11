// src/routes/auth.js
// Flux : login → (si 2FA activé) envoi code email → vérification → dashboard
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const { query } = require('../../config/database');
const { redirectIfAuthenticated } = require('../middleware/auth');
const { auditLog } = require('../middleware/logger');
const { generateOtp, verifyOtp } = require('../utils/otp');
const { sendOtpCode } = require('../utils/email');

const render = (res, data) => res.render('login', {
  title: 'Connexion', error: null, expired: false, blocked: false, step: 'login',
  ...data
});

// ── GET /login ──────────────────────────────────────────
router.get('/login', redirectIfAuthenticated, (req, res) => {
  render(res, { expired: req.query.expired === '1' });
});

// ── POST /login — Étape 1 : mot de passe ───────────────
router.post('/login', redirectIfAuthenticated, [
  body('username').trim().isLength({ min: 1, max: 50 }).escape(),
  body('password').isLength({ min: 1, max: 100 })
], async (req, res) => {
  if (!validationResult(req).isEmpty()) {
    return render(res, { error: 'Identifiants invalides.' });
  }

  const { username, password } = req.body;

  try {
    const result = await query(
      `SELECT id, username, email, password_hash, is_active, is_admin,
              email_2fa_enabled, failed_attempts, locked_until
       FROM users WHERE username = $1 LIMIT 1`,
      [username.toLowerCase()]
    );

    // Timing-safe : toujours comparer même si l'utilisateur n'existe pas
    const DUMMY = '$2a$12$dummyhashfortimingprotectionXXXXXXXXXXXXXXXXXXXXXXXXX';
    const hash = result.rows[0]?.password_hash || DUMMY;
    const match = await bcrypt.compare(password, hash);
    const user = result.rows[0];

    // Compte verrouillé ?
    if (user?.locked_until && new Date(user.locked_until) > new Date()) {
      const wait = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000);
      await auditLog(user.id, 'LOGIN_BLOCKED', req.ip, { username });
      return render(res, { error: `Compte bloqué. Réessayez dans ${wait} minute(s).` });
    }

    if (!user || !match || !user.is_active) {
      // Verrouillage progressif : 5 → 5min, 10 → 30min, 15 → 2h
      if (user) {
        const attempts = (user.failed_attempts || 0) + 1;
        let lockedUntil = null;
        if (attempts >= 15) lockedUntil = new Date(Date.now() + 2 * 3600000);
        else if (attempts >= 10) lockedUntil = new Date(Date.now() + 30 * 60000);
        else if (attempts >= 5) lockedUntil = new Date(Date.now() + 5 * 60000);
        await query(
          'UPDATE users SET failed_attempts = $1, locked_until = $2 WHERE id = $3',
          [attempts, lockedUntil, user.id]
        );
      }
      await auditLog(user?.id || null, 'LOGIN_FAILED', req.ip, { username });
      return render(res, { error: 'Identifiants incorrects.' });
    }

    // Réinitialiser les tentatives
    await query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);

    // 2FA par email activé → envoyer le code
    if (user.email_2fa_enabled) {
      const code = await generateOtp(user.id);

      try {
        await sendOtpCode(user.email, user.username, code);
      } catch (emailErr) {
        console.error('❌ Erreur envoi email OTP:', emailErr.message);
        return render(res, { error: 'Impossible d\'envoyer le code email. Contactez l\'administrateur.' });
      }

      // Session intermédiaire pré-2FA
      req.session.pre2fa = { userId: user.id, username: user.username, isAdmin: user.is_admin };
      const ttlMinutes = Math.round((parseInt(process.env.OTP_TTL) || 600) / 60);
      return render(res, {
        title: 'Code de vérification',
        step: '2fa',
        // Masquer partiellement l'email pour la confidentialité
        emailHint: maskEmail(user.email),
        ttlMinutes
      });
    }

    // Pas de 2FA → connexion directe
    await finalizeLogin(req, res, user);

  } catch (err) {
    console.error('Erreur login:', err);
    render(res, { error: 'Erreur serveur. Réessayez.' });
  }
});

// ── POST /login/2fa — Étape 2 : code email ─────────────
router.post('/login/2fa', [
  body('code').trim().isLength({ min: 6, max: 6 }).isNumeric()
], async (req, res) => {
  const renderOtp = (error) => render(res, {
    title: 'Code de vérification', step: '2fa',
    emailHint: req.session.pre2fa ? maskEmail('...') : '',
    ttlMinutes: Math.round((parseInt(process.env.OTP_TTL) || 600) / 60),
    error
  });

  if (!req.session.pre2fa) return res.redirect('/login');
  if (!validationResult(req).isEmpty()) return renderOtp('Code invalide (6 chiffres).');

  const { userId, username, isAdmin } = req.session.pre2fa;

  try {
    const valid = await verifyOtp(userId, req.body.code);

    if (!valid) {
      await auditLog(userId, 'OTP_FAILED', req.ip, { username });
      return renderOtp('Code incorrect ou expiré. Revenez en arrière pour en demander un nouveau.');
    }

    delete req.session.pre2fa;
    const result = await query('SELECT id, username, is_admin FROM users WHERE id = $1', [userId]);
    await finalizeLogin(req, res, result.rows[0]);

  } catch (err) {
    console.error('Erreur 2FA:', err);
    renderOtp('Erreur serveur.');
  }
});

// ── GET /register/:token — Inscription via invitation ──
router.get('/register/:token', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, is_admin FROM invitations
       WHERE token = $1 AND used = false AND expires_at > NOW()`,
      [req.params.token]
    );

    if (result.rows.length === 0) {
      return res.render('register', {
        title: 'Invitation invalide',
        error: 'Ce lien d\'invitation est invalide ou expiré.',
        token: null, email: null
      });
    }

    res.render('register', {
      title: 'Créer votre compte',
      error: null,
      token: req.params.token,
      email: result.rows[0].email
    });
  } catch (err) {
    console.error('Erreur register:', err);
    res.redirect('/login');
  }
});

// ── POST /register/:token — Finalisation de l'inscription
router.post('/register/:token', [
  body('username').trim().isLength({ min: 3, max: 50 }).isAlphanumeric().escape(),
  body('password').isLength({ min: 12, max: 100 }),
  body('password_confirm').custom((val, { req }) => {
    if (val !== req.body.password) throw new Error('Les mots de passe ne correspondent pas.');
    return true;
  })
], async (req, res) => {
  const renderError = (error) => res.render('register', {
    title: 'Créer votre compte', error,
    token: req.params.token, email: req.body.email || ''
  });

  const errors = validationResult(req);
  if (!errors.isEmpty()) return renderError(errors.array()[0].msg);

  try {
    // Vérifier l'invitation
    const invite = await query(
      `SELECT id, email, is_admin FROM invitations
       WHERE token = $1 AND used = false AND expires_at > NOW()`,
      [req.params.token]
    );

    if (invite.rows.length === 0) return renderError('Invitation invalide ou expirée.');

    const { username, password } = req.body;
    const { email, is_admin } = invite.rows[0];

    // Vérifier unicité du nom d'utilisateur
    const existing = await query('SELECT id FROM users WHERE username = $1', [username.toLowerCase()]);
    if (existing.rows.length > 0) return renderError('Ce nom d\'utilisateur est déjà pris.');

    // Créer l'utilisateur
    const hash = await bcrypt.hash(password, 12);
    const newUser = await query(
      `INSERT INTO users (username, email, password_hash, is_active, is_admin)
       VALUES ($1, $2, $3, true, $4) RETURNING id, username, is_admin`,
      [username.toLowerCase(), email, hash, is_admin]
    );

    // Invalider l'invitation
    await query('UPDATE invitations SET used = true WHERE token = $1', [req.params.token]);
    await auditLog(newUser.rows[0].id, 'ACCOUNT_CREATED', req.ip, { username, email });

    // Connexion automatique
    await finalizeLogin(req, res, newUser.rows[0]);

  } catch (err) {
    console.error('Erreur register:', err);
    renderError('Erreur serveur. Réessayez.');
  }
});

// ── POST /logout ────────────────────────────────────────
router.post('/logout', (req, res) => {
  const user = req.session?.user;
  req.session.destroy((err) => {
    if (err) console.error('Erreur logout:', err);
    if (user) auditLog(user.id, 'LOGOUT', req.ip, { username: user.username });
    res.clearCookie('sid');
    res.redirect('/login');
  });
});

// ── Helper ──────────────────────────────────────────────
async function finalizeLogin(req, res, user) {
  req.session.regenerate(async (err) => {
    if (err) { console.error('Erreur session:', err); return res.redirect('/login'); }
    req.session.user = {
      id: user.id, username: user.username,
      isAdmin: user.is_admin || false,
      loginAt: Date.now()
    };
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    await auditLog(user.id, 'LOGIN_SUCCESS', req.ip, { username: user.username });
    const returnTo = req.session.returnTo || '/dashboard';
    delete req.session.returnTo;
    res.redirect(returnTo);
  });
}

// Masquer l'email : ex. jean.dupont@gmail.com → j***@gmail.com
function maskEmail(email) {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  return local[0] + '***@' + domain;
}

module.exports = router;
