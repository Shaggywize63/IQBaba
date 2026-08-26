const pool = require('../config/db');
const bcrypt = require('../utils/hash');
const { generatePassword } = require('../utils/password');
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
    const { fullName, studentClass, schoolId, customSchoolName, board, email, phone, password, subjects, idCardFile } = req.body;

    if (!fullName || !studentClass || (!schoolId && !customSchoolName) || !board || !subjects || subjects.length === 0) {
      res.status(400);
      throw new Error('Please add all required fields and select at least one subject');
    }

    // Generate a username that is actually free — a bare 4-digit suffix collides
    // often for common names, and the UNIQUE index would fail the whole signup.
    const usernameBase = fullName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40) || 'student';
    let username;
    for (let attempt = 0; attempt < 12; attempt++) {
      const candidate = usernameBase + Math.floor(1000 + Math.random() * 9000);
      const [taken] = await pool.execute('SELECT id FROM students WHERE username = ?', [candidate]);
      if (taken.length === 0) { username = candidate; break; }
    }
    if (!username) {
      res.status(500);
      throw new Error('Could not allocate a username, please try again');
    }

    // A student never chooses a password at sign-up; the screen shows them the
    // one generated here. A caller may still supply their own.
    const plainPassword = password || generatePassword();

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(plainPassword, salt);
    const registrationDate = new Date().toISOString().split('T')[0];

    // Determine status (Active if registered school, Inactive if unregistered school)
    const status = schoolId ? 'Active' : 'Inactive';

    // Handle File Upload (Base64)
    let idCardPath = null;
    if (idCardFile && idCardFile.data && idCardFile.name) {
      const fs = require('fs');
      const path = require('path');
      const uploadsDir = path.resolve(__dirname, '../../uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const ext = path.extname(idCardFile.name) || '.png';
      const filename = `student-id-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}${ext}`;
      const filePath = path.join(uploadsDir, filename);
      const base64Data = idCardFile.data.replace(/^data:.*?;base64,/, "");
      fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
      idCardPath = `uploads/${filename}`;
    }

    // Transaction for atomic insert
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Insert Student
      const [studentResult] = await connection.execute(
        'INSERT INTO students (full_name, class_level, school_id, custom_school_name, board, email, phone, id_card_path, username, password_hash, status, registration_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [fullName, studentClass, schoolId || null, customSchoolName || null, board, email || null, phone || null, idCardPath, username, hashedPassword, status, registrationDate]
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
        status,
        // The student never typed a username — the UI must show them these.
        loginUsername: username,
        loginPassword: plainPassword,
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

    const identifier = String(username).trim();
    let tableName, userField, rows;

    if (role === 'admin') {
      tableName = 'admins';
      userField = 'username';
      [rows] = await pool.execute('SELECT * FROM admins WHERE username = ?', [identifier]);
    } else if (role === 'school') {
      tableName = 'schools';
      userField = 'email';
      [rows] = await pool.execute('SELECT * FROM schools WHERE email = ?', [identifier]);
    } else if (role === 'student') {
      tableName = 'students';
      userField = 'username';
      // Students never choose their username — it is generated at signup — so let
      // them sign in with the email they did type. Email is not unique on this
      // table, so it only counts when it identifies exactly one student.
      [rows] = await pool.execute('SELECT * FROM students WHERE username = ?', [identifier]);
      if (rows.length === 0 && identifier.includes('@')) {
        const [byEmail] = await pool.execute('SELECT * FROM students WHERE email = ?', [identifier]);
        if (byEmail.length === 1) {
          rows = byEmail;
        } else if (byEmail.length > 1) {
          res.status(409);
          throw new Error('That email is registered to more than one student. Please sign in with your username.');
        }
      }
    } else {
      res.status(400);
      throw new Error('Invalid role');
    }

    if (rows.length === 0) {
      res.status(401);
      throw new Error('Invalid credentials');
    }

    const user = rows[0];

    if (!user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401);
      throw new Error('Invalid credentials');
    }

    // A deactivated account must not receive a token — students awaiting admin
    // approval are created Inactive on purpose, and admins deactivate schools.
    if (user.status === 'Inactive') {
      res.status(403);
      throw new Error(role === 'student'
        ? 'Your account is pending activation by the administrator.'
        : 'This account has been deactivated. Please contact the administrator.');
    }

    await pool.execute(`UPDATE ${tableName} SET last_login = NOW() WHERE id = ?`, [user.id]);

    res.json({
      id: user.id,
      [userField]: user[userField],
      role: role,
      token: generateToken(user.id, role),
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all active schools for student registration
// @route   GET /api/auth/schools
// @access  Public
const getPublicSchools = async (req, res, next) => {
  try {
    const [schools] = await pool.query('SELECT id, name FROM schools WHERE status = "Active" ORDER BY name');
    res.json(schools);
  } catch (error) {
    next(error);
  }
};

// Reference data the admin maintains. These are read-only and carry nothing
// sensitive, so sign-up forms and the school portal can read them without a
// token — the /api/admin/* equivalents are admin-only and would 403.

// @desc    Boards configured in Board Management
// @route   GET /api/auth/boards
// @access  Public
const getPublicBoards = async (req, res, next) => {
  try {
    const [boards] = await pool.query('SELECT id, name FROM boards ORDER BY name');
    res.json(boards);
  } catch (error) {
    next(error);
  }
};

// @desc    Classes configured in Class Management
// @route   GET /api/auth/classes
// @access  Public
const getPublicClasses = async (req, res, next) => {
  try {
    const [classes] = await pool.query('SELECT id, name, level FROM classes ORDER BY level');
    res.json(classes);
  } catch (error) {
    next(error);
  }
};

// @desc    Subjects configured in Subject Management
// @route   GET /api/auth/subjects
// @access  Public
const getPublicSubjects = async (req, res, next) => {
  try {
    const [subjects] = await pool.query('SELECT id, code, name FROM subjects ORDER BY name');
    res.json(subjects);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerStudent,
  loginUser,
  getPublicSchools,
  getPublicBoards,
  getPublicClasses,
  getPublicSubjects
};
