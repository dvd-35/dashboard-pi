// config/database.js
// Connexion PostgreSQL avec pool de connexions
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  // Limites adaptées au Raspberry Pi (ressources limitées)
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: false // En local, pas besoin de SSL
});

// Test de connexion au démarrage
pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('✅ PostgreSQL connecté');
  }
});

pool.on('error', (err) => {
  console.error('❌ Erreur PostgreSQL inattendue:', err.message);
  process.exit(-1);
});

// Helper pour exécuter des requêtes
const query = async (text, params) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.log('Query:', { text, duration: `${duration}ms`, rows: res.rowCount });
  }
  return res;
};

// Helper pour les transactions
const withTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { pool, query, withTransaction };
