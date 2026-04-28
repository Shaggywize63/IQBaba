const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Generate JWT
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @desc    Register new student
// @route   POST /api/auth/register/student
// @access  Public
const registerStudent = async (req, res, next) => {
  try {
    const { fullName, studentClass, schoolId, board, email, phone, password, subjects } = req.body;

    if (!fullName || !studentClass || !schoolId || !board || !password || !subjects || subjects.length === 0) {
      res.status(400);
      throw new Error('Please add all required fields and select at least one subject');
    }

    // Generate unique username
    const username = fullName.toLowerCase().replace(/\s+/g, '') + Math.floor(1000 + Math.random() * 9000);

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const registrationDate = new Date().toISOString().split('T')[0];

    // Transaction for atomic insert
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Insert Student
      const [studentResult] = await connection.execute(
        'INSERT INTO students (full_name, class_level, school_id, board, email, phone, username, password_hash, registration_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [fullName, studentClass, schoolId, board, email || null, phone || null, username, hashedPassword, registrationDate]
      );
      
      const studentId = studentResult.insertId;

      // Insert Student Subjects
      for (const subjectId of subjects) {
        await connection.execute(
          'INSERT INTO student_subjects (student_id, subject_id) VALUES (?, ?)',
          [studentId, subjectId]
        );
      }

      await connection.commit();

      res.status(201).json({
        id: studentId,
        username,
        email,
        token: generateToken(studentId, 'student')
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res, next) => {
  try {
    const { username, password, role } = req.body; // role: 'student', 'school', 'admin'

    if (!username || !password || !role) {
      res.status(400);
      throw new Error('Please provide username, password and role');
    }

    let tableName, userField;
    if (role === 'student' || role === 'admin') {
      tableName = `${role}s`;
      userField = 'username';
    } else if (role === 'school') {
      tableName = 'schools';
      userField = 'email'; // Assuming school logs in with email
    } else {
      res.status(400);
      throw new Error('Invalid role');
    }

    // Check for user email/username
    const [rows] = await pool.execute(`SELECT * FROM ${tableName} WHERE ${userField} = ?`, [username]);
    
    if (rows.length === 0) {
      res.status(401);
      throw new Error('Invalid credentials');
    }

    const user = rows[0];

    // Check password
    if (user && (await bcrypt.compare(password, user.password_hash))) {
      
      // Update last login
      await pool.execute(`UPDATE ${tableName} SET last_login = NOW() WHERE id = ?`, [user.id]);

      res.json({
        id: user.id,
        [userField]: user[userField],
        role: role,
        token: generateToken(user.id, role),
      });
    } else {
      res.status(401);
      throw new Error('Invalid credentials');
    }
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerStudent,
  loginUser
};
