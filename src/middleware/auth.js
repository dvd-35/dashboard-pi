// src/middleware/auth.js
// Middleware de protection des routes

const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.user) {
    // Mémoriser la page demandée pour rediriger après login
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }

  // Vérification que la session n'est pas expirée côté applicatif
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

// Middleware pour les routes API (retourne JSON au lieu de redirect)
const requireAuthApi = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ 
      success: false, 
      error: 'Non authentifié' 
    });
  }
  next();
};

// Empêche les utilisateurs connectés d'accéder au login
const redirectIfAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  next();
};

module.exports = { requireAuth, requireAuthApi, redirectIfAuthenticated };
