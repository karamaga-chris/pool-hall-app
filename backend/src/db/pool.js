const { Pool } = require('pg');
require('dotenv').config();

// Hosted Postgres (Neon, Supabase, ...) requires SSL. Enable it in production,
// or locally by setting DB_SSL=true. Plain local Postgres stays unencrypted.
const useSsl = process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true';
const ssl = useSsl ? { rejectUnauthorized: true } : false;

// Either a single DATABASE_URL, or the separate DB_* variables.
const config = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl }
  : {
      host:     process.env.DB_HOST,
      port:     parseInt(process.env.DB_PORT, 10),
      database: process.env.DB_NAME,
      user:     process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl,
    };

const pool = new Pool(config);

pool.on('connect', () => console.log('PostgreSQL connected'));
pool.on('error', (err) => console.error('DB error:', err.message));

module.exports = pool;
