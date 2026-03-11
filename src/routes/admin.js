// src/routes/admin.js
const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query } = require('../../config/database');
const { requireAdmin } = require('../middleware/auth');
const { auditLog } = require('../middleware/logger');
const { sendInvitation } = require('../utils/email');

// ── GET /admin/users ─────────────────────────────────────
router.get('/users', requireAdmin, async (req, res) => {
  const [users, invites] = await Promise.all([
    query('SELECT id, username, email, is_active, is_admin, email_2fa_enabled, last_login, created_at FROM users ORDER BY created_at ASC'),
    query(`SELECT id, email, is_admin, used, expires_at, created_at FROM invitations
           WHERE used = false AND expires_at > NOW() ORDER BY created_at DESC`)
  ]);

  res.render('admin/users', {
    title: 'Gestion des utilisateurs',
    users: users.rows,
    pendingInvites: invites.rows,
    error: null,
    success: req.query.success || null
  });
});

// ── POST /admin/users/invite — Envoyer une invitation ───
router.post('/users/invite', requireAdmin, [
  body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
  body('is_admin').optional()
], async (req, res) => {
  const renderError = async (error) => {
    const [users, invites] = await Promise.all([
      query('SELECT id, username, email, is_active, is_admin, email_2fa_enabled, last_login, created_at FROM users ORDER BY created_at ASC'),
      query('SELECT id, email, is_admin, used, expires_at, created_at FROM invitations WHERE used = false AND expires_at > NOW() ORDER BY created_at DESC')
    ]);
    res.render('admin/users', { title: 'Gestion des utilisateurs', users: users.rows, pendingInvites: invites.rows, error, success: null });
  };

  const errors = validationResult(req);
  if (!errors.isEmpty()) return renderError(errors.array()[0].msg);

  const { email, is_admin } = req.body;
  const ttlHours = parseInt(process.env.INVITE_TTL_HOURS) || 48;

  try {
    // Vérifier si l'email n'est pas déjà utilisé
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) return renderError('Cet email est déjà enregistré.');

    // Vérifier qu'il n'y a pas déjà une invitation en cours
    const existingInvite = await query(
      'SELECT id FROM invitations WHERE email = $1 AND used = false AND expires_at > NOW()',
      [email]
    );
    if (existingInvite.rows.length > 0) return renderError('Une invitation est déjà en attente pour cet email.');

    // Générer un token aléatoire
    const token = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + ttlHours * 3600000);

    await query(
      'INSERT INTO invitations (token, email, invited_by, is_admin, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [token, email, req.session.user.id, is_admin === 'on', expiresAt]
    );

    // Envoyer l'email
    const inviteUrl = `${process.env.APP_URL}/register/${token}`;
    await sendInvitation(email, req.session.user.username, inviteUrl, ttlHours);

    await auditLog(req.session.user.id, 'INVITE_SENT', req.ip, { email, isAdmin: is_admin === 'on' });
    res.redirect('/admin/users?success=invited');

  } catch (err) {
    console.error('Erreur invitation:', err);
    renderError('Erreur lors de l\'envoi. Vérifiez la configuration SMTP.');
  }
});

// ── POST /admin/users/invite/:id/cancel — Annuler ────────
router.post('/users/invite/:id/cancel', requireAdmin, async (req, res) => {
  await query('DELETE FROM invitations WHERE id = $1', [req.params.id]);
  await auditLog(req.session.user.id, 'INVITE_CANCELLED', req.ip, { inviteId: req.params.id });
  res.redirect('/admin/users');
});

// ── POST /admin/users/:id/toggle ─────────────────────────
router.post('/users/:id/toggle', requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id);
  if (userId === req.session.user.id) return res.redirect('/admin/users');
  await query('UPDATE users SET is_active = NOT is_active WHERE id = $1', [userId]);
  await auditLog(req.session.user.id, 'USER_TOGGLED', req.ip, { targetUserId: userId });
  res.redirect('/admin/users');
});

// ── POST /admin/users/:id/reset-password ─────────────────
router.post('/users/:id/reset-password', requireAdmin, [
  param('id').isInt({ min: 1 }),
  body('new_password').isLength({ min: 12, max: 100 }).withMessage('Min 12 caractères')
], async (req, res) => {
  if (!validationResult(req).isEmpty()) return res.redirect('/admin/users?error=invalid');
  const hash = await bcrypt.hash(req.body.new_password, 12);
  await query(
    'UPDATE users SET password_hash = $1, failed_attempts = 0, locked_until = NULL WHERE id = $2',
    [hash, req.params.id]
  );
  await auditLog(req.session.user.id, 'PASSWORD_RESET', req.ip, { targetUserId: req.params.id });
  res.redirect('/admin/users?success=password_reset');
});

// ── POST /admin/users/:id/delete ─────────────────────────
router.post('/users/:id/delete', requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id);
  if (userId === req.session.user.id) return res.redirect('/admin/users');
  await query('DELETE FROM users WHERE id = $1', [userId]);
  await auditLog(req.session.user.id, 'USER_DELETED', req.ip, { targetUserId: userId });
  res.redirect('/admin/users');
});

// ── GET /admin/2fa — Paramètres 2FA personnels ───────────
router.get('/2fa', async (req, res) => {
  const result = await query('SELECT email_2fa_enabled, email FROM users WHERE id = $1', [req.session.user.id]);
  res.render('admin/2fa', {
    title: 'Double authentification',
    user2fa: result.rows[0],
    error: null,
    success: req.query.success || null
  });
});

// ── POST /admin/2fa/toggle — Activer / désactiver le 2FA ─
router.post('/2fa/toggle', async (req, res) => {
  const result = await query('SELECT email_2fa_enabled FROM users WHERE id = $1', [req.session.user.id]);
  const current = result.rows[0]?.email_2fa_enabled;

  // Pour activer, l'utilisateur doit avoir un email
  const userResult = await query('SELECT email FROM users WHERE id = $1', [req.session.user.id]);
  if (!userResult.rows[0]?.email) {
    return res.redirect('/admin/2fa?error=no_email');
  }

  await query('UPDATE users SET email_2fa_enabled = $1 WHERE id = $2', [!current, req.session.user.id]);
  await auditLog(req.session.user.id, current ? '2FA_DISABLED' : '2FA_ENABLED', req.ip, { username: req.session.user.username });
  res.redirect(`/admin/2fa?success=${current ? 'disabled' : 'enabled'}`);
});

module.exports = router;
