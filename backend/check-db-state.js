const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function check() {
    console.log('Connecting to:', process.env.DB_NAME);
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'olympiad_db'
    });

    try {
        const [tables] = await connection.query('SHOW TABLES');
        console.log('--- TABLES ---');
        console.log(tables);

        const [qCols] = await connection.query('SHOW COLUMNS FROM questions');
        console.log('--- QUESTIONS COLS ---');
        console.log(qCols.map(c => c.Field).join(', '));

        const [eCols] = await connection.query('SHOW COLUMNS FROM exams');
        console.log('--- EXAMS COLS ---');
        console.log(eCols.map(c => c.Field).join(', '));

    } catch (error) {
        console.error(error);
    } finally {
        await connection.end();
    }
}

check();
