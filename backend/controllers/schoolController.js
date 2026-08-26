const pool = require('../config/db');
const bcrypt = require('../utils/hash');
const {
  str, optional, isValidEmail, normalizeClassLevel, normalizeStatus, describeDbError
} = require('../utils/importHelpers');

// @desc    Get all students for the logged-in school
// @route   GET /api/schools/students
// @access  Private (School)
const getSchoolStudents = async (req, res, next) => {
  try {
    const schoolId = req.user.id;

    const [students] = await pool.execute(
      'SELECT id, full_name, username, class_level, board, city, email, phone, status, registration_date FROM students WHERE school_id = ?',
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
    const { fullName, studentClass, board, city, email, phone, username, password } = req.body;

    if (!str(fullName) || !str(username)) {
      res.status(400);
      throw new Error('Full name and username are required');
    }
    if (str(email) && !isValidEmail(str(email))) {
      res.status(400);
      throw new Error('Please provide a valid email address');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password || 'password123', salt);

    const [result] = await pool.execute(
      'INSERT INTO students (full_name, username, password_hash, class_level, school_id, board, city, email, phone, registration_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
      [str(fullName), str(username), hashedPassword, normalizeClassLevel(studentClass), schoolId, str(board), optional(city), optional(email), optional(phone)]
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

// @desc    Bulk create students for the logged-in school from a CSV import
// @route   POST /api/schools/students/bulk
// @access  Private (School)
const bulkAddStudents = async (req, res, next) => {
  try {
    const schoolId = req.user.id;
    const { students } = req.body;
    if (!Array.isArray(students) || students.length === 0) {
      res.status(400);
      throw new Error('Please provide a non-empty array of students');
    }

    const salt = await bcrypt.genSalt(10);
    const defaultPassword = await bcrypt.hash('password123', salt);
    const regDate = new Date().toISOString().split('T')[0];

    const failed = [];
    const created = [];
    const seenUsernames = new Set();

    for (let i = 0; i < students.length; i++) {
      const row = students[i] || {};
      const rowNum = i + 1;
      const fullName = str(row.fullName);
      const username = str(row.username);

      const reject = error => failed.push({ index: rowNum, identifier: username || fullName || `Row ${rowNum}`, error });

      if (!fullName) { reject('Full name is required'); continue; }
      if (!username) { reject('Username is required'); continue; }
      if (!/^[A-Za-z0-9._-]{3,100}$/.test(username)) {
        reject(`Username "${username}" must be 3-100 characters using letters, numbers, dot, underscore or hyphen only`);
        continue;
      }
      if (seenUsernames.has(username.toLowerCase())) { reject(`Username "${username}" appears more than once in this file`); continue; }

      const classLevel = normalizeClassLevel(row.classLevel);
      if (!classLevel) { reject('Class is required'); continue; }

      const board = str(row.board);
      if (!board) { reject('Board is required'); continue; }

      const email = str(row.email);
      if (email && !isValidEmail(email)) { reject(`"${email}" is not a valid email address`); continue; }

      const status = row.status ? normalizeStatus(row.status) : 'Active';
      if (row.status && !status) { reject(`Status must be Active or Inactive (got "${row.status}")`); continue; }

      let passwordHash = defaultPassword;
      if (str(row.password)) {
        passwordHash = await bcrypt.hash(str(row.password), salt);
      }

      try {
        const [result] = await pool.execute(
          `INSERT INTO students (full_name, username, password_hash, class_level, school_id, board, city, email, phone, status, registration_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            fullName, username, passwordHash, classLevel, schoolId, board,
            optional(row.city), optional(email), optional(row.phone), status || 'Active', regDate
          ]
        );
        seenUsernames.add(username.toLowerCase());
        created.push({ id: result.insertId, fullName, username });
      } catch (error) {
        reject(describeDbError(error, { duplicateHint: username }));
      }
    }

    res.status(failed.length === students.length ? 400 : 201).json({
      message: `${created.length} of ${students.length} student(s) uploaded successfully`,
      inserted: created.length,
      created,
      failed
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update one of the school's own students
// @route   PUT /api/schools/students/:id
// @access  Private (School)
const updateStudent = async (req, res, next) => {
  try {
    const schoolId = req.user.id;
    const { id } = req.params;
    const { fullName, username, studentClass, board, city, email, phone, status, password } = req.body;

    // Scope every lookup to the caller's school so one school cannot touch another's roster.
    const [existing] = await pool.execute('SELECT id FROM students WHERE id = ? AND school_id = ?', [id, schoolId]);
    if (existing.length === 0) {
      res.status(404);
      throw new Error('Student not found for this school');
    }

    if (!str(fullName) || !str(username)) {
      res.status(400);
      throw new Error('Full name and username are required');
    }
    if (str(email) && !isValidEmail(str(email))) {
      res.status(400);
      throw new Error('Please provide a valid email address');
    }
    if (status && !normalizeStatus(status)) {
      res.status(400);
      throw new Error('Status must be Active or Inactive');
    }

    const fields = {
      full_name: str(fullName),
      username: str(username),
      class_level: normalizeClassLevel(studentClass),
      board: str(board),
      city: optional(city),
      email: optional(email),
      phone: optional(phone)
    };
    if (status) fields.status = normalizeStatus(status);

    if (str(password)) {
      const salt = await bcrypt.genSalt(10);
      fields.password_hash = await bcrypt.hash(str(password), salt);
    }

    const columns = Object.keys(fields);
    await pool.execute(
      `UPDATE students SET ${columns.map(c => `${c} = ?`).join(', ')} WHERE id = ? AND school_id = ?`,
      [...columns.map(c => fields[c]), id, schoolId]
    );

    res.json({ message: 'Student updated successfully' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400);
      return next(new Error(describeDbError(error)));
    }
    next(error);
  }
};

// @desc    Delete one of the school's own students
// @route   DELETE /api/schools/students/:id
// @access  Private (School)
const deleteStudent = async (req, res, next) => {
  try {
    const schoolId = req.user.id;
    const { id } = req.params;

    const [result] = await pool.execute('DELETE FROM students WHERE id = ? AND school_id = ?', [id, schoolId]);
    if (result.affectedRows === 0) {
      res.status(404);
      throw new Error('Student not found for this school');
    }

    res.json({ message: 'Student deleted successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSchoolStudents,
  getSchoolResults,
  getSchoolStats,
  addStudent,
  bulkAddStudents,
  updateStudent,
  deleteStudent
};
