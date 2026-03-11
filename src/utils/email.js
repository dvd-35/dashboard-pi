// src/utils/email.js
// Envoi d'emails via SMTP (Gmail ou autre)
const nodemailer = require('nodemailer');

// ── Créer le transporteur SMTP ──────────────────────────
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true pour port 465
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    // Délai adapté au Raspberry Pi (réseau parfois lent)
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
};

// ── Test de connexion SMTP ──────────────────────────────
const testConnection = async () => {
  try {
    const t = createTransporter();
    await t.verify();
    console.log('✅ SMTP connecté :', process.env.SMTP_HOST);
    return true;
  } catch (err) {
    console.error('❌ SMTP erreur :', err.message);
    console.error('   Vérifiez SMTP_HOST, SMTP_USER, SMTP_PASS dans .env');
    return false;
  }
};

// ── Envoyer un code OTP ─────────────────────────────────
const sendOtpCode = async (toEmail, username, code) => {
  const transporter = createTransporter();
  const ttlMinutes = Math.round((parseInt(process.env.OTP_TTL) || 600) / 60);

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: toEmail,
    subject: '🔐 Code de connexion — Dashboard Pi',
    text: `Votre code de connexion : ${code}\nValable ${ttlMinutes} minutes.`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: -apple-system, sans-serif; background: #0d1117; color: #e6edf3; padding: 2rem; margin: 0;">
        <div style="max-width: 400px; margin: 0 auto; background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 2rem;">
          <div style="text-align: center; margin-bottom: 1.5rem;">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">🖥️</div>
            <h2 style="margin: 0; font-size: 1.125rem; color: #e6edf3;">Dashboard Pi</h2>
            <p style="margin: 0.25rem 0 0; color: #8b949e; font-size: 0.875rem;">Code de connexion</p>
          </div>

          <p style="color: #8b949e; font-size: 0.875rem; margin-bottom: 1.5rem;">
            Bonjour <strong style="color: #e6edf3;">${username}</strong>,<br>
            Voici votre code de vérification :
          </p>

          <div style="background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 1.5rem; text-align: center; margin-bottom: 1.5rem;">
            <span style="font-size: 2.5rem; font-weight: 800; letter-spacing: 0.5rem; color: #58a6ff; font-family: monospace;">${code}</span>
          </div>

          <p style="color: #8b949e; font-size: 0.8125rem; text-align: center; margin: 0;">
            ⏱️ Ce code expire dans <strong style="color: #e6edf3;">${ttlMinutes} minutes</strong>.<br>
            Si vous n'avez pas demandé ce code, ignorez cet email.
          </p>
        </div>
      </body>
      </html>
    `
  });
};

// ── Envoyer un lien d'invitation ────────────────────────
const sendInvitation = async (toEmail, inviterUsername, inviteUrl, ttlHours) => {
  const transporter = createTransporter();

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: toEmail,
    subject: `✉️ Invitation — Dashboard Pi`,
    text: `${inviterUsername} vous invite à rejoindre Dashboard Pi.\nLien : ${inviteUrl}\nValable ${ttlHours} heures.`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: -apple-system, sans-serif; background: #0d1117; color: #e6edf3; padding: 2rem; margin: 0;">
        <div style="max-width: 440px; margin: 0 auto; background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 2rem;">
          <div style="text-align: center; margin-bottom: 1.5rem;">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">🖥️</div>
            <h2 style="margin: 0; font-size: 1.125rem; color: #e6edf3;">Dashboard Pi</h2>
          </div>

          <p style="color: #8b949e; font-size: 0.875rem; margin-bottom: 1.5rem;">
            <strong style="color: #e6edf3;">${inviterUsername}</strong> vous invite à rejoindre le Dashboard Pi.
            Cliquez sur le lien ci-dessous pour créer votre compte.
          </p>

          <div style="text-align: center; margin-bottom: 1.5rem;">
            <a href="${inviteUrl}"
               style="display: inline-block; background: #58a6ff; color: #0d1117; padding: 0.75rem 2rem;
                      border-radius: 8px; font-weight: 600; text-decoration: none; font-size: 0.9375rem;">
              Créer mon compte
            </a>
          </div>

          <p style="color: #8b949e; font-size: 0.8125rem; text-align: center; margin: 0;">
            ⏱️ Ce lien expire dans <strong style="color: #e6edf3;">${ttlHours} heures</strong>.<br>
            Si vous n'attendiez pas cette invitation, ignorez cet email.
          </p>

          <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #30363d;">
            <p style="color: #484f58; font-size: 0.75rem; word-break: break-all;">
              Lien direct : ${inviteUrl}
            </p>
          </div>
        </div>
      </body>
      </html>
    `
  });
};

module.exports = { testConnection, sendOtpCode, sendInvitation };
