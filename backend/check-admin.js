const pool = require('./config/db');
const bcrypt = require('bcrypt');

async function checkAdmin() {
  try {
    const [rows] = await pool.execute('SELECT * FROM admins WHERE username = ?', ['admin']);
    if (rows.length === 0) {
      console.log('Admin user NOT found!');
    } else {
      const admin = rows[0];
      console.log('Admin found:', admin.username);
      const match = await bcrypt.compare('admin123', admin.password_hash);
      console.log('Password match (admin123):', match);
    }
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkAdmin();
