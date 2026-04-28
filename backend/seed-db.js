const pool = require('./config/db');
const bcrypt = require('bcrypt');

async function seed() {
  const connection = await pool.getConnection();
  try {
    console.log('Seeding database...');
    await connection.beginTransaction();

    const salt = await bcrypt.genSalt(10);
    const adminPass = await bcrypt.hash('admin123', salt);
    const schoolPass = await bcrypt.hash('school123', salt);
    const studentPass = await bcrypt.hash('password123', salt);

    // 1. Seed Admin
    await connection.execute(
      'INSERT INTO admins (username, email, password_hash) VALUES (?, ?, ?)',
      ['admin', 'admin@example.com', adminPass]
    );

    // 2. Seed Subjects
    await connection.execute(
      'INSERT INTO subjects (code, name, default_duration, default_questions) VALUES (?, ?, ?, ?), (?, ?, ?, ?)',
      ['MATH', 'Mathematics', 60, 30, 'SCI', 'Science', 45, 25]
    );

    // 3. Seed School
    const [schoolResult] = await connection.execute(
      'INSERT INTO schools (name, email, password_hash) VALUES (?, ?, ?)',
      ['Delhi Public School', 'dps@example.com', schoolPass]
    );
    const schoolId = schoolResult.insertId;

    // 4. Seed Student
    await connection.execute(
      'INSERT INTO students (full_name, username, password_hash, class_level, school_id, board, registration_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['Rahul Sharma', 'rahul123', studentPass, '10', schoolId, 'CBSE', new Date().toISOString().split('T')[0]]
    );

    await connection.commit();
    console.log('Database seeded successfully!');
    process.exit(0);
  } catch (error) {
    await connection.rollback();
    console.error('Seeding failed:', error.message);
    process.exit(1);
  } finally {
    connection.release();
  }
}

seed();
