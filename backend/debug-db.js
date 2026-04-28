const pool = require('./config/db');

async function test() {
  try {
    const [rows] = await pool.query('SELECT 1');
    console.log('Query result:', rows);
    process.exit(0);
  } catch (err) {
    console.error('FULL ERROR:', JSON.stringify(err, null, 2));
    console.error('MESSAGE:', err.message);
    process.exit(1);
  }
}

test();
