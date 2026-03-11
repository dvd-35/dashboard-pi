// src/utils/otp.js
// Génération et vérification des codes OTP 6 chiffres
const crypto = require('crypto');
const { query } = require('../../config/database');

const OTP_TTL = parseInt(process.env.OTP_TTL) || 600; // secondes

// ── Générer et stocker un code OTP ─────────────────────
const generateOtp = async (userId) => {
  // Invalider les anciens codes de cet utilisateur
  await query(
    'UPDATE otp_codes SET used = true WHERE user_id = $1 AND used = false',
    [userId]
  );

  // Code à 6 chiffres cryptographiquement sûr
  const code = String(crypto.randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + OTP_TTL * 1000);

  await query(
    'INSERT INTO otp_codes (user_id, code, expires_at) VALUES ($1, $2, $3)',
    [userId, code, expiresAt]
  );

  return code;
};

// ── Vérifier un code OTP ────────────────────────────────
const verifyOtp = async (userId, inputCode) => {
  // Nettoyage des espaces éventuels
  const code = inputCode.trim();

  const result = await query(
    `SELECT id FROM otp_codes
     WHERE user_id = $1
       AND code = $2
       AND used = false
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, code]
  );

  if (result.rows.length === 0) return false;

  // Marquer comme utilisé (usage unique)
  await query('UPDATE otp_codes SET used = true WHERE id = $1', [result.rows[0].id]);

  return true;
};

// ── Nettoyage périodique des codes expirés ──────────────
const cleanupExpiredOtps = async () => {
  await query('DELETE FROM otp_codes WHERE expires_at < NOW() OR used = true');
};

// Nettoyage toutes les heures
setInterval(cleanupExpiredOtps, 3600 * 1000);

module.exports = { generateOtp, verifyOtp };
