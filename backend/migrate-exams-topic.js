const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'olympiad_portal'
    });

    console.log('Adding topic_id to exams table...');

    try {
        const [columns] = await connection.query('SHOW COLUMNS FROM exams LIKE "topic_id"');
        if (columns.length === 0) {
            await connection.query("ALTER TABLE exams ADD COLUMN topic_id INT DEFAULT NULL AFTER subject_id");
            await connection.query("ALTER TABLE exams ADD CONSTRAINT fk_exam_topic FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL ON UPDATE CASCADE");
            console.log('Added topic_id column to exams.');
        } else {
            console.log('topic_id column already exists in exams.');
        }
    } catch (error) {
        console.error(error);
    } finally {
        await connection.end();
    }
}

migrate();
