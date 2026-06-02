const mysql = require('mysql2/promise');
const path = require('path');

// Try loading backend/.env first, then fallback to root .env using absolute paths
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

let dbHost = process.env.DB_HOST;
if (!dbHost || dbHost === 'localhost') {
  dbHost = '127.0.0.1';
}

console.log(`[DB Debug] Attempting database connection to: ${dbHost} with user: ${process.env.DB_USER}`);

const pool = mysql.createPool({
  host: dbHost,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
