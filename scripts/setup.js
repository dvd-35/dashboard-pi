// scripts/setup.js
// Lancer UNE SEULE FOIS : node scripts/setup.js

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (q) => new Promise(resolve => rl.question(q, resolve));

const setup = async () => {
  console.log('\n🔧 Setup Dashboard Pi\n================================\n');

  try {
    await pool.query('SELECT 1');
    console.log('✅ Connexion PostgreSQL OK\n');
  } catch (err) {
    console.error('❌ Impossible de se connecter à PostgreSQL');
    console.error('   Vérifiez votre .env — Erreur:', err.message);
    process.exit(1);
  }

  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('✅ Tables créées\n');
  } catch (err) {
    console.error('❌ Erreur création tables:', err.message);
    process.exit(1);
  }

  const existing = await pool.query("SELECT COUNT(*) FROM users");
  if (parseInt(existing.rows[0].count) > 0) {
    console.log('ℹ️  Un utilisateur existe déjà.');
    const reset = await question('Réinitialiser le mot de passe ? (o/N) : ');
    if (reset.toLowerCase() !== 'o') {
      console.log('\n✅ Setup terminé.\n');
      rl.close();
      pool.end();
      return;
    }
  }

  console.log('📝 Création du compte administrateur\n');
  const username = await question('Identifiant (défaut: admin) : ') || 'admin';

  let password = '';
  while (password.length < 8) {
    password = await question('Mot de passe (min 8 caractères) : ');
    if (password.length < 8) console.log('⚠️  Minimum 8 caractères.');
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    await pool.query(`
      INSERT INTO users (username, password_hash, is_active)
      VALUES ($1, $2, true)
      ON CONFLICT (username) DO UPDATE SET password_hash = $2, is_active = true
    `, [username.toLowerCase(), hash]);

    console.log(`\n✅ Compte créé : ${username}\n`);
  } catch (err) {
    console.error('❌ Erreur:', err.message);
    process.exit(1);
  }

  const addSamples = await question('Ajouter des bookmarks de démo ? (o/N) : ');
  if (addSamples.toLowerCase() === 'o') {
    const user = await pool.query("SELECT id FROM users WHERE username = $1", [username.toLowerCase()]);
    const userId = user.rows[0].id;
    const samples = [
      [userId, 'GitHub', 'https://github.com', 'Dev'],
      [userId, 'MDN Web Docs', 'https://developer.mozilla.org', 'Dev'],
      [userId, 'Node.js Docs', 'https://nodejs.org/docs', 'Dev']
    ];
    for (const [uid, title, url, cat] of samples) {
      await pool.query(
        'INSERT INTO bookmarks (user_id, title, url, category) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [uid, title, url, cat]
      ).catch(() => {});
    }
    console.log('✅ Bookmarks de démo ajoutés\n');
  }

  console.log('🎉 Setup terminé ! Lancez : npm start\n');
  rl.close();
  pool.end();
};

setup().catch(err => {
  console.error('Erreur setup:', err);
  process.exit(1);
});
