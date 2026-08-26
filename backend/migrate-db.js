const mysql = require('mysql2/promise');
const bcrypt = require('./utils/hash');
require('dotenv').config();

async function migrate() {
    // Connecting was outside the try below, so bad credentials or an
    // unreachable database rejected before anything could catch it.
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'olympiad_portal'
        });
    } catch (error) {
        console.error(`Migrations skipped - could not connect to the database as ` +
            `"${process.env.DB_USER}" on "${process.env.DB_HOST}": ${error.message}`);
        return;
    }

    console.log('Starting migrations...');

    try {
        // 1. Add status to schools if not exists
        const [columns] = await connection.query('SHOW COLUMNS FROM schools LIKE "status"');
        if (columns.length === 0) {
            console.log('Adding status column to schools table...');
            await connection.query("ALTER TABLE schools ADD COLUMN status ENUM('Active', 'Inactive') DEFAULT 'Active' AFTER password_hash");
        }

        // Add additional columns to schools
        const schoolCols = [
            { name: 'code', definition: "VARCHAR(50) DEFAULT NULL UNIQUE" },
            { name: 'contact_person', definition: "VARCHAR(255) DEFAULT NULL" },
            { name: 'board', definition: "VARCHAR(100) DEFAULT NULL" },
            { name: 'city', definition: "VARCHAR(100) DEFAULT NULL" },
            { name: 'address', definition: "TEXT DEFAULT NULL" },
            { name: 'classes', definition: "VARCHAR(255) DEFAULT NULL" },
            { name: 'subjects', definition: "VARCHAR(255) DEFAULT NULL" },
            { name: 'student_strength', definition: "INT DEFAULT 0" }
        ];

        for (const col of schoolCols) {
            const [hasCol] = await connection.query(`SHOW COLUMNS FROM schools LIKE "${col.name}"`);
            if (hasCol.length === 0) {
                console.log(`Adding ${col.name} column to schools table...`);
                await connection.query(`ALTER TABLE schools ADD COLUMN ${col.name} ${col.definition}`);
            }
        }

        // Add start_date and end_date to exams
        const examCols = [
            { name: 'start_date', definition: "DATE DEFAULT NULL" },
            { name: 'end_date', definition: "DATE DEFAULT NULL" }
        ];

        for (const col of examCols) {
            const [hasCol] = await connection.query(`SHOW COLUMNS FROM exams LIKE "${col.name}"`);
            if (hasCol.length === 0) {
                console.log(`Adding ${col.name} column to exams table...`);
                await connection.query(`ALTER TABLE exams ADD COLUMN ${col.name} ${col.definition}`);
            }
        }

        // The admins table predates these migrations, so a database restored from
        // an older dump can be missing it entirely — and then every admin login
        // fails with a 500 instead of "invalid credentials".
        console.log('Ensuring admins table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS admins (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(100) NOT NULL UNIQUE,
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                remember_token VARCHAR(100) DEFAULT NULL,
                last_login TIMESTAMP NULL DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // An empty admins table locks everyone out of the portal. Create the
        // first account from the environment rather than inventing a default
        // password that would then be the same on every deployment.
        const [adminCount] = await connection.query('SELECT COUNT(*) AS count FROM admins');
        if (adminCount[0].count === 0) {
            const username = process.env.ADMIN_USERNAME;
            const password = process.env.ADMIN_PASSWORD;
            if (username && password) {
                const email = process.env.ADMIN_EMAIL || `${username}@localhost`;
                const hash = await bcrypt.hash(password, 10);
                await connection.query(
                    'INSERT INTO admins (username, email, password_hash) VALUES (?, ?, ?)',
                    [username, email, hash]
                );
                console.log(`Created the first admin account: ${username}`);
            } else {
                console.warn('No admin accounts exist. Create one with: node backend/create-admin.js <username> <email> <password>');
            }
        }

        // Create support_messages table
        console.log('Creating support_messages table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS support_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'Guest',
                subject VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                status ENUM('Open', 'Resolved') DEFAULT 'Open',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

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

        // Update students table for unregistered schools and ID uploads
        console.log('Altering students school_id column to be NULLable...');
        await connection.query('ALTER TABLE students MODIFY COLUMN school_id INT DEFAULT NULL');

        const [hasCustomSchool] = await connection.query('SHOW COLUMNS FROM students LIKE "custom_school_name"');
        if (hasCustomSchool.length === 0) {
            console.log('Adding custom_school_name column to students table...');
            await connection.query('ALTER TABLE students ADD COLUMN custom_school_name VARCHAR(255) DEFAULT NULL AFTER school_id');
        }

        const [hasIdCard] = await connection.query('SHOW COLUMNS FROM students LIKE "id_card_path"');
        if (hasIdCard.length === 0) {
            console.log('Adding id_card_path column to students table...');
            await connection.query('ALTER TABLE students ADD COLUMN id_card_path VARCHAR(255) DEFAULT NULL AFTER phone');
        }

        const [hasStudentCity] = await connection.query('SHOW COLUMNS FROM students LIKE "city"');
        if (hasStudentCity.length === 0) {
            console.log('Adding city column to students table...');
            await connection.query('ALTER TABLE students ADD COLUMN city VARCHAR(100) DEFAULT NULL AFTER board');
        }

        // Questions: question_type + widened correct_option are required for
        // multiple-selection questions and for bulk uploads that use them.
        const [hasQuestionType] = await connection.query('SHOW COLUMNS FROM questions LIKE "question_type"');
        if (hasQuestionType.length === 0) {
            console.log('Adding question_type column to questions table...');
            await connection.query("ALTER TABLE questions ADD COLUMN question_type ENUM('Single', 'Multiple') DEFAULT 'Single' AFTER topic_id");
        }

        const [correctOptionCol] = await connection.query('SHOW COLUMNS FROM questions LIKE "correct_option"');
        if (correctOptionCol.length > 0 && /^enum/i.test(correctOptionCol[0].Type)) {
            console.log('Widening questions.correct_option to VARCHAR(50)...');
            await connection.query("ALTER TABLE questions MODIFY COLUMN correct_option VARCHAR(50) NOT NULL");
        }

        const [hasTopicText] = await connection.query('SHOW COLUMNS FROM questions LIKE "topic"');
        if (hasTopicText.length === 0) {
            console.log('Adding topic column to questions table...');
            await connection.query('ALTER TABLE questions ADD COLUMN topic VARCHAR(255) DEFAULT NULL AFTER topic_id');
        }

        // Indexes that back the search bars on the admin listing screens.
        const addIndex = async (table, indexName, columns) => {
            const [existing] = await connection.query(`SHOW INDEX FROM ${table} WHERE Key_name = ?`, [indexName]);
            if (existing.length === 0) {
                console.log(`Adding index ${indexName} on ${table}...`);
                await connection.query(`ALTER TABLE ${table} ADD INDEX ${indexName} (${columns})`);
            }
        };
        await addIndex('schools', 'idx_schools_city', 'city');
        await addIndex('schools', 'idx_schools_board', 'board');
        await addIndex('students', 'idx_students_city', 'city');

        console.log('Migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await connection.end();
    }
}

module.exports = migrate;

// `node backend/migrate-db.js` runs them; server.js calls migrate() itself
// once the port is bound, so a database problem cannot stop the API booting.
if (require.main === module) {
    migrate().catch(error => {
        console.error('Migration failed:', error.message);
        process.exitCode = 1;
    });
}
