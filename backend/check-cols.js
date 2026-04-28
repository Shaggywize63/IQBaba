const mysql = require('mysql2/promise');
require('dotenv').config();

async function check() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'olympiad_portal'
    });

    try {
        const [qCols] = await connection.query('SHOW COLUMNS FROM questions');
        const [eCols] = await connection.query('SHOW COLUMNS FROM exams');
        console.log('--- QUESTIONS ---');
        console.log(JSON.stringify(qCols, null, 2));
        console.log('--- EXAMS ---');
        console.log(JSON.stringify(eCols, null, 2));
    } catch (error) {
        console.error(error);
    } finally {
        await connection.end();
    }
}

check();
