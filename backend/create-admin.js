/**
 * Create an admin account, or reset an existing one's password.
 *
 *   node backend/create-admin.js <username> <email> <password>
 *   node backend/create-admin.js admin admin@school.com 'a strong password'
 *
 * Re-running with an existing username updates that account's email and
 * password, so this doubles as a password reset when nobody can get in.
 */
const path = require('path');
const dotenv = require('dotenv');
const bcrypt = require('./utils/hash');

dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = require('./config/db');

async function main() {
  const [username, email, password] = process.argv.slice(2);

  if (!username || !email || !password) {
    console.error('Usage: node backend/create-admin.js <username> <email> <password>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Choose a password of at least 8 characters.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);
  const [existing] = await pool.execute('SELECT id FROM admins WHERE username = ?', [username]);

  if (existing.length > 0) {
    await pool.execute(
      'UPDATE admins SET email = ?, password_hash = ? WHERE id = ?',
      [email, hash, existing[0].id]
    );
    console.log(`Updated admin "${username}".`);
  } else {
    await pool.execute(
      'INSERT INTO admins (username, email, password_hash) VALUES (?, ?, ?)',
      [username, email, hash]
    );
    console.log(`Created admin "${username}".`);
  }

  await pool.end();
}

main().catch(error => {
  console.error('Failed:', error.message);
  process.exit(1);
});
