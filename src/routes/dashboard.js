// src/routes/dashboard.js
const express = require('express');
const router = express.Router();
const { query } = require('../../config/database');
const systemUtils = require('../utils/system');

// GET /dashboard - Page principale
router.get('/', async (req, res) => {
  try {
    const [notes, bookmarks, systemInfo] = await Promise.allSettled([
      query('SELECT * FROM notes WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 5', [req.session.user.id]),
      query('SELECT * FROM bookmarks WHERE user_id = $1 ORDER BY created_at DESC', [req.session.user.id]),
      systemUtils.getSystemInfo()
    ]);

    res.render('dashboard', {
      title: 'Dashboard',
      notes: notes.status === 'fulfilled' ? notes.value.rows : [],
      bookmarks: bookmarks.status === 'fulfilled' ? bookmarks.value.rows : [],
      system: systemInfo.status === 'fulfilled' ? systemInfo.value : null,
      user: req.session.user
    });
  } catch (err) {
    console.error('Erreur dashboard:', err);
    res.render('dashboard', {
      title: 'Dashboard',
      notes: [],
      bookmarks: [],
      system: null,
      user: req.session.user,
      error: 'Erreur lors du chargement des données'
    });
  }
});

module.exports = router;
