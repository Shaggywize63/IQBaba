const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function check() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'olympiad_db'
    });

    try {
        const [exams] = await connection.query('SELECT id, title, subject_id, total_questions FROM exams');
        console.log('--- EXAMS ---');
        for (const exam of exams) {
            const [linked] = await connection.query('SELECT COUNT(*) as count FROM exam_questions WHERE exam_id = ?', [exam.id]);
            const [subjectQs] = await connection.query('SELECT COUNT(*) as count FROM questions WHERE subject_id = ?', [exam.subject_id]);
            console.log(`Exam ID: ${exam.id}, Title: ${exam.title}, Required Qs: ${exam.total_questions}, Linked Qs: ${linked[0].count}, Available in Subject: ${subjectQs[0].count}`);
        }
    } catch (error) {
        console.error(error);
    } finally {
        await connection.end();
    }
}

check();
