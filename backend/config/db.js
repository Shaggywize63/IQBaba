const mysql = require('mysql2/promise');
require('dotenv').config();

console.log(`[DB Debug] Attempting database connection to: ${process.env.DB_HOST} with user: ${process.env.DB_USER}`);

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
