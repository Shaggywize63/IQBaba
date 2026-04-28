const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'olympiad_portal'
    });

    console.log('Starting migrations...');

    try {
        // 1. Add status to schools if not exists
        const [columns] = await connection.query('SHOW COLUMNS FROM schools LIKE "status"');
        if (columns.length === 0) {
            console.log('Adding status column to schools table...');
            await connection.query("ALTER TABLE schools ADD COLUMN status ENUM('Active', 'Inactive') DEFAULT 'Active' AFTER password_hash");
        }

        // 2. Create Boards table
        console.log('Creating boards table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS boards (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // 3. Create Classes table
        console.log('Creating classes table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS classes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(50) NOT NULL UNIQUE,
                level INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // 4. Create Topics table
        console.log('Creating topics table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS topics (
                id INT AUTO_INCREMENT PRIMARY KEY,
                subject_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // 5. Update Questions table - Add topic_id and remove topic column if needed
        const [qColumns] = await connection.query('SHOW COLUMNS FROM questions LIKE "topic_id"');
        if (qColumns.length === 0) {
            console.log('Updating questions table...');
            await connection.query("ALTER TABLE questions ADD COLUMN topic_id INT DEFAULT NULL AFTER subject_id");
            await connection.query("ALTER TABLE questions ADD CONSTRAINT fk_question_topic FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL ON UPDATE CASCADE");
            // Optional: migrate data from 'topic' text column if needed, but for now we just keep both or drop 'topic'
            // await connection.query("ALTER TABLE questions DROP COLUMN topic");
        }

        // 6. Seed some default data
        console.log('Seeding default data...');
        
        // Boards
        const boards = [['CBSE', 'Central Board of Secondary Education'], ['ICSE', 'Indian Certificate of Secondary Education'], ['State Board', 'Generic State Board']];
        for (const [name, desc] of boards) {
            await connection.query('INSERT IGNORE INTO boards (name, description) VALUES (?, ?)', [name, desc]);
        }

        // Classes
        for (let i = 6; i <= 12; i++) {
            await connection.query('INSERT IGNORE INTO classes (name, level) VALUES (?, ?)', [`Class ${i}`, i]);
        }

        console.log('Migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await connection.end();
    }
}

migrate();
