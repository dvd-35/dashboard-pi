// src/middleware/auth.js

const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }

  if (req.session.user.loginAt) {
    const sessionAge = Date.now() - req.session.user.loginAt;
    const maxAge = parseInt(process.env.SESSION_MAX_AGE) || 28800000;
    if (sessionAge > maxAge) {
      req.session.destroy();
      return res.redirect('/login?expired=1');
    }
  }

  next();
};

const requireAuthApi = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ success: false, error: 'Non authentifié' });
  }
  next();
};

const redirectIfAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  next();
};

module.exports = { requireAuth, requireAuthApi, redirectIfAuthenticated };
