const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function run() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'olympiad_db'
    });
    const [rows] = await connection.query('SELECT id, title, is_enabled FROM exams WHERE id = 1');
    console.log(rows);
    await connection.end();
}
run();
