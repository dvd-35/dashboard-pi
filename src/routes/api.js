// src/routes/api.js
const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const { query } = require('../../config/database');
const systemUtils = require('../utils/system');
const { apiRateLimit } = require('../middleware/rateLimiter');

router.use(apiRateLimit);

// Helper pour la validation
const validate = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return false;
  }
  return true;
};

// ============================================
// SYSTÈME
// ============================================
router.get('/system', async (req, res) => {
  try {
    const info = await systemUtils.getSystemInfo();
    res.json({ success: true, data: info });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur lecture système' });
  }
});

// ============================================
// NOTES
// ============================================
router.get('/notes', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM notes WHERE user_id = $1 ORDER BY updated_at DESC',
      [req.session.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur lecture notes' });
  }
});

router.post('/notes', [
  body('title').trim().isLength({ min: 1, max: 200 }).escape(),
  body('content').trim().isLength({ max: 10000 }).escape()
], async (req, res) => {
  if (!validate(req, res)) return;
  
  try {
    const { title, content } = req.body;
    const result = await query(
      'INSERT INTO notes (user_id, title, content) VALUES ($1, $2, $3) RETURNING *',
      [req.session.user.id, title, content || '']
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur création note' });
  }
});

router.put('/notes/:id', [
  param('id').isInt({ min: 1 }),
  body('title').trim().isLength({ min: 1, max: 200 }).escape(),
  body('content').trim().isLength({ max: 10000 }).escape()
], async (req, res) => {
  if (!validate(req, res)) return;
  
  try {
    const result = await query(
      `UPDATE notes SET title = $1, content = $2, updated_at = NOW() 
       WHERE id = $3 AND user_id = $4 RETURNING *`,
      [req.body.title, req.body.content, req.params.id, req.session.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Note introuvable' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur mise à jour note' });
  }
});

router.delete('/notes/:id', [
  param('id').isInt({ min: 1 })
], async (req, res) => {
  if (!validate(req, res)) return;
  
  try {
    // On vérifie que la note appartient bien à l'utilisateur (ownership check)
    const result = await query(
      'DELETE FROM notes WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.session.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Note introuvable' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur suppression note' });
  }
});

// ============================================
// BOOKMARKS
// ============================================
router.get('/bookmarks', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM bookmarks WHERE user_id = $1 ORDER BY category, title',
      [req.session.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur lecture bookmarks' });
  }
});

router.post('/bookmarks', [
  body('title').trim().isLength({ min: 1, max: 200 }).escape(),
  body('url').isURL({ require_protocol: true }).withMessage('URL invalide'),
  body('category').trim().isLength({ max: 50 }).escape().optional()
], async (req, res) => {
  if (!validate(req, res)) return;
  
  try {
    const { title, url, category } = req.body;
    const result = await query(
      'INSERT INTO bookmarks (user_id, title, url, category) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.session.user.id, title, url, category || 'Général']
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur création bookmark' });
  }
});

router.delete('/bookmarks/:id', [
  param('id').isInt({ min: 1 })
], async (req, res) => {
  if (!validate(req, res)) return;
  
  try {
    const result = await query(
      'DELETE FROM bookmarks WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.session.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Bookmark introuvable' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur suppression bookmark' });
  }
});

module.exports = router;
