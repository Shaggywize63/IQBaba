const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'olympiad_portal'
    });

    console.log('Starting migration to support multiple selection questions...');

    try {
        // 1. Add question_type column to questions table
        const [qTypeCols] = await connection.query('SHOW COLUMNS FROM questions LIKE "question_type"');
        if (qTypeCols.length === 0) {
            console.log('Adding question_type column...');
            await connection.query("ALTER TABLE questions ADD COLUMN question_type ENUM('Single', 'Multiple') DEFAULT 'Single' AFTER topic_id");
        }

        // 2. Change correct_option from ENUM to VARCHAR to support multiple answers
        console.log('Changing correct_option to VARCHAR(50)...');
        // We first change it to VARCHAR so it can hold comma-separated values
        await connection.query("ALTER TABLE questions MODIFY COLUMN correct_option VARCHAR(50) NOT NULL");

        console.log('Migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await connection.end();
    }
}

migrate();
