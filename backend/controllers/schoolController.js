const pool = require('../config/db');
const bcrypt = require('bcrypt');

// @desc    Get all students for the logged-in school
// @route   GET /api/schools/students
// @access  Private (School)
const getSchoolStudents = async (req, res, next) => {
  try {
    const schoolId = req.user.id;

    const [students] = await pool.execute(
      'SELECT id, full_name, class_level, board, email, phone, status, registration_date FROM students WHERE school_id = ?',
      [schoolId]
    );

    res.json({
      count: students.length,
      students
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all exam results for the school's students
// @route   GET /api/schools/results
// @access  Private (School)
const getSchoolResults = async (req, res, next) => {
  try {
    const schoolId = req.user.id;

    // Join results, students, and exams to get comprehensive data
    const query = `
      SELECT 
        r.id AS result_id, 
        s.full_name AS student_name, 
        s.class_level,
        e.title AS exam_title,
        r.score, 
        r.total_marks, 
        r.percentage, 
        r.date_taken
      FROM results r
      JOIN students s ON r.student_id = s.id
      JOIN exams e ON r.exam_id = e.id
      WHERE s.school_id = ?
      ORDER BY r.date_taken DESC
    `;

    const [results] = await pool.execute(query, [schoolId]);

    res.json({
      count: results.length,
      results
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get school stats
// @route   GET /api/schools/stats
// @access  Private (School)
const getSchoolStats = async (req, res, next) => {
  try {
    const schoolId = req.user.id;

    const [students] = await pool.execute('SELECT COUNT(*) as count FROM students WHERE school_id = ?', [schoolId]);
    
    // Total exams taken by this school's students
    const [results] = await pool.execute(`
      SELECT COUNT(*) as count 
      FROM results r
      JOIN students s ON r.student_id = s.id
      WHERE s.school_id = ?
    `, [schoolId]);

    // Average score
    const [avgScore] = await pool.execute(`
      SELECT AVG(r.percentage) as avg 
      FROM results r
      JOIN students s ON r.student_id = s.id
      WHERE s.school_id = ?
    `, [schoolId]);

    res.json({
      totalStudents: students[0].count,
      examsTaken: results[0].count,
      averageScore: avgScore[0].avg ? parseFloat(avgScore[0].avg).toFixed(2) : 0
    });
  } catch (error) {
    next(error);
  }
};

const addStudent = async (req, res, next) => {
  try {
    const schoolId = req.user.id;
    const { fullName, studentClass, board, email, phone, username, password } = req.body;
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password || 'password123', salt);

    const emailVal = email || null;
    const phoneVal = phone || null;

    const [result] = await pool.execute(
      'INSERT INTO students (full_name, username, password_hash, class_level, school_id, board, email, phone, registration_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())',
      [fullName, username, hashedPassword, studentClass, schoolId, board, emailVal, phoneVal]
    );

    res.status(201).json({
      message: 'Student created successfully',
      studentId: result.insertId
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400);
      return next(new Error('Username or email already exists'));
    }
    next(error);
  }
};

const bulkAddStudents = async (req, res, next) => {
  try {
    const schoolId = req.user.id;
    const { students } = req.body;
    if (!students || !Array.isArray(students)) {
      res.status(400);
      throw new Error('Please provide an array of students');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('password123', salt);

    const regDate = new Date().toISOString().split('T')[0];
    const values = students.map(s => [
      s.fullName, 
      s.username, 
      hashedPassword, 
      s.classLevel, 
      schoolId, 
      s.board, 
      s.email || null, 
      s.phone || null,
      regDate
    ]);
    
    await pool.query(
      'INSERT INTO students (full_name, username, password_hash, class_level, school_id, board, email, phone, registration_date) VALUES ?',
      [values]
    );

    res.status(201).json({ message: `${students.length} students uploaded successfully` });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSchoolStudents,
  getSchoolResults,
  getSchoolStats,
  addStudent,
  bulkAddStudents
};
