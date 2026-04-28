const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'olympiad_portal'
    });

    console.log('Creating exam_questions and exam_assignments tables...');

    try {
        await connection.query(`
            CREATE TABLE IF NOT EXISTS exam_questions (
                exam_id INT NOT NULL,
                question_id INT NOT NULL,
                PRIMARY KEY (exam_id, question_id),
                FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
                FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS exam_assignments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                exam_id INT NOT NULL,
                school_id INT DEFAULT NULL,
                student_id INT DEFAULT NULL,
                FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
                FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
            )
        `);

        console.log('Tables created successfully.');
    } catch (error) {
        console.error(error);
    } finally {
        await connection.end();
    }
}

migrate();
