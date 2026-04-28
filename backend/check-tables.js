const pool = require('./config/db');

async function check() {
  const tables = ['boards', 'classes', 'subjects', 'topics'];
  for (const table of tables) {
    try {
      const [rows] = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`Table ${table}: ${rows[0].count} rows found.`);
    } catch (err) {
      console.error(`Error checking table ${table}:`, err.message);
    }
  }
  process.exit(0);
}

check();
