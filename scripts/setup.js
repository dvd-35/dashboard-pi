// scripts/setup.js — npm run setup
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const pool = new Pool({
  host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

const setup = async () => {
  console.log('\n🔧 Setup Dashboard Pi v4\n');

  try { await pool.query('SELECT 1'); console.log('✅ PostgreSQL OK\n'); }
  catch (e) { console.error('❌ PostgreSQL:', e.message); process.exit(1); }

  try {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('✅ Tables créées\n');
  } catch (e) { console.error('❌ Tables:', e.message); process.exit(1); }

  const existing = await pool.query("SELECT COUNT(*) FROM users WHERE is_admin = true");
  if (parseInt(existing.rows[0].count) > 0) {
    console.log('ℹ️  Un administrateur existe déjà. Setup terminé.\n');
    rl.close(); pool.end(); return;
  }

  console.log('📝 Création du compte administrateur\n');
  const username = (await ask('Identifiant admin (défaut: admin) : ')) || 'admin';

  let email = '';
  while (!email.includes('@')) {
    email = await ask('Email admin (pour recevoir les codes 2FA) : ');
    if (!email.includes('@')) console.log('⚠️  Email invalide.');
  }

  let password = '';
  while (password.length < 12) {
    password = await ask('Mot de passe (min 12 caractères) : ');
    if (password.length < 12) console.log('⚠️  Minimum 12 caractères.');
  }

  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    'INSERT INTO users (username, email, password_hash, is_active, is_admin) VALUES ($1, $2, $3, true, true)',
    [username.toLowerCase(), email.toLowerCase(), hash]
  );
  console.log(`\n✅ Admin créé : ${username} <${email}>\n`);

  const certsOk = fs.existsSync(path.join(process.cwd(), 'certs', 'key.pem'));
  if (!certsOk) console.log('⚠️  Lancez : npm run gencert\n');
  else console.log('✅ Certificats SSL présents\n');

  console.log('🎉 Prêt ! Lancez : npm start\n');
  rl.close(); pool.end();
};

setup().catch(e => { console.error(e); process.exit(1); });
