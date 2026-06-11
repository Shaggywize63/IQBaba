const pool = require('../config/db');
const bcrypt = require('bcrypt');

// @desc    Create a new exam configuration
// @route   POST /api/admin/exams
// @access  Private (Admin)
const createExam = async (req, res, next) => {
  try {
    const { 
      subjectId, topicId, title, scheduleDate, startDate, endDate, durationMinutes, totalQuestions, 
      passingPercentage, easyMarks, mediumMarks, hardMarks, negativeMarking, 
      isEnabled, randomizeQuestions, 
      questionIds, schoolId, studentIds, timeSlots 
    } = req.body;

    if (!subjectId || !title || (!scheduleDate && !startDate) || !durationMinutes || !totalQuestions || !passingPercentage) {
      res.status(400);
      throw new Error('Please provide all required exam configuration fields');
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Create Exam
      const [examResult] = await connection.execute(
        `INSERT INTO exams (subject_id, topic_id, title, schedule_date, start_date, end_date, duration_minutes, total_questions, passing_percentage, easy_marks, medium_marks, hard_marks, negative_marking, is_enabled, randomize_questions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          subjectId, 
          topicId || null, 
          title, 
          scheduleDate || startDate, 
          startDate || null, 
          endDate || null, 
          durationMinutes, 
          totalQuestions, 
          passingPercentage, 
          easyMarks || 1, 
          mediumMarks || 3, 
          hardMarks || 5, 
          negativeMarking || false, 
          isEnabled !== undefined ? isEnabled : true, 
          randomizeQuestions !== undefined ? randomizeQuestions : true
        ]
      );

      const examId = examResult.insertId;

      // Link Questions
      if (questionIds && Array.isArray(questionIds) && questionIds.length > 0) {
        const qValues = questionIds.map(qid => [examId, qid]);
        await connection.query('INSERT INTO exam_questions (exam_id, question_id) VALUES ?', [qValues]);
      }

      // Handle Assignment
      if (schoolId) {
        if (studentIds && Array.isArray(studentIds) && studentIds.length > 0) {
          // Assign to specific students
          const aValues = studentIds.map(sid => [examId, schoolId, sid]);
          await connection.query('INSERT INTO exam_assignments (exam_id, school_id, student_id) VALUES ?', [aValues]);
        } else {
          // Assign to entire school
          await connection.execute('INSERT INTO exam_assignments (exam_id, school_id) VALUES (?, ?)', [examId, schoolId]);
        }
      } else {
        // Global assignment (no specific school/student)
        await connection.execute('INSERT INTO exam_assignments (exam_id) VALUES (?)', [examId]);
      }

      // Insert Time Slots if provided
      if (timeSlots && Array.isArray(timeSlots) && timeSlots.length > 0) {
        for (const slot of timeSlots) {
          // slot is expected to be an object: { label: '10:00 AM - 12:00 PM', start: '10:00:00', end: '12:00:00' }
          if (slot.label && slot.start && slot.end) {
            await connection.execute(
              'INSERT INTO exam_time_slots (exam_id, slot_label, start_time, end_time) VALUES (?, ?, ?, ?)',
              [examId, slot.label, slot.start, slot.end]
            );
          }
        }
      }

      await connection.commit();

      res.status(201).json({
        message: 'Exam created successfully',
        examId
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

// @desc    Add a new question to the question bank
// @route   POST /api/admin/questions
// @access  Private (Admin)
const addQuestion = async (req, res, next) => {
  try {
    console.log('Add Question Request Body:', req.body);
    const { subjectId, topicId, text, difficulty, options, correctAnswerIndex, questionType, correctOptions } = req.body;

    const missingFields = [];
    if (!subjectId) missingFields.push('subjectId');
    if (!text) missingFields.push('text');
    if (!difficulty) missingFields.push('difficulty');
    if (!options) missingFields.push('options');

    if (missingFields.length > 0) {
      res.status(400);
      throw new Error(`Please provide all question fields. Missing: ${missingFields.join(', ')}`);
    }

    // Get topic name if topicId is provided
    let topicName = '';
    if (topicId) {
      const [topics] = await pool.execute('SELECT name FROM topics WHERE id = ?', [topicId]);
      if (topics.length > 0) {
        topicName = topics[0].name;
      }
    }

    // Map index to Letter (0 -> A, 1 -> B, etc.)
    const indexToLetter = (idx) => String.fromCharCode(65 + parseInt(idx));

    let correctOptionStr = '';
    if (questionType === 'Multiple') {
      if (!correctOptions || !Array.isArray(correctOptions) || correctOptions.length === 0) {
        res.status(400);
        throw new Error('Please select at least one correct option');
      }
      correctOptionStr = correctOptions.map(indexToLetter).join(',');
    } else {
      if (correctAnswerIndex === undefined) {
        res.status(400);
        throw new Error('Please select the correct answer');
      }
      correctOptionStr = indexToLetter(correctAnswerIndex);
    }

    const [result] = await pool.execute(
      `INSERT INTO questions (subject_id, topic_id, topic, question_text, option_a, option_b, option_c, option_d, question_type, correct_option, difficulty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [subjectId, topicId || null, topicName, text, options[0], options[1], options[2], options[3], questionType || 'Single', correctOptionStr, difficulty]
    );

    res.status(201).json({
      message: 'Question added successfully',
      questionId: result.insertId
    });
  } catch (error) {
    next(error);
  }
};

const deleteQuestion = async (req, res, next) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM questions WHERE id = ?', [id]);
    res.json({ message: 'Question deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get dashboard stats
// @route   GET /api/admin/stats
// @access  Private (Admin)
const getStats = async (req, res, next) => {
  try {
    const [students] = await pool.query('SELECT COUNT(*) as count FROM students');
    const [schools] = await pool.query('SELECT COUNT(*) as count FROM schools');
    const [results] = await pool.query('SELECT COUNT(*) as count FROM results');
    const [questions] = await pool.query('SELECT COUNT(*) as count FROM questions');

    res.json({
      totalStudents: students[0].count,
      totalSchools: schools[0].count,
      examsTaken: results[0].count,
      totalQuestions: questions[0].count
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all students
// @route   GET /api/admin/students
// @access  Private (Admin)
const getStudents = async (req, res, next) => {
  try {
    const { schoolId } = req.query;
    let query = 'SELECT s.*, sc.name as school_name FROM students s JOIN schools sc ON s.school_id = sc.id';
    const params = [];
    
    if (schoolId) {
      query += ' WHERE s.school_id = ?';
      params.push(schoolId);
    }
    
    const [students] = await pool.query(query, params);
    res.json(students);
  } catch (error) {
    next(error);
  }
};

// @desc    Get all schools
// @route   GET /api/admin/schools
// @access  Private (Admin)
const getSchools = async (req, res, next) => {
  try {
    const [schools] = await pool.query('SELECT * FROM schools');
    res.json(schools);
  } catch (error) {
    next(error);
  }
};

// @desc    Get all results
// @route   GET /api/admin/results
// @access  Private (Admin)
const getResults = async (req, res, next) => {
  try {
    const query = `
      SELECT r.id, s.full_name as student_name, sc.name as school_name, e.title as exam_title, r.score, r.percentage, r.date_taken
      FROM results r
      JOIN students s ON r.student_id = s.id
      JOIN schools sc ON s.school_id = sc.id
      JOIN exams e ON r.exam_id = e.id
      ORDER BY r.date_taken DESC
    `;
    const [results] = await pool.query(query);
    res.json(results);
  } catch (error) {
    next(error);
  }
};

// @desc    Get all questions
// @route   GET /api/admin/questions
// @access  Private (Admin)
const getQuestions = async (req, res, next) => {
  try {
    const [questions] = await pool.query('SELECT q.*, s.name as subject_name FROM questions q JOIN subjects s ON q.subject_id = s.id');
    res.json(questions);
  } catch (error) {
    next(error);
  }
};

// @desc    Add a new school
// @route   POST /api/admin/schools
// @access  Private (Admin)
const addSchool = async (req, res, next) => {
  try {
    const { name, code, contactPerson, email, phone, board, city, address, classes, subjects, studentStrength } = req.body;
    
    // Hash a default password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('school123', salt);

    // Auto-generate school code if not provided
    let schoolCode = code;
    if (!schoolCode) {
      const cleanName = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const prefix = cleanName.length >= 3 ? cleanName.substring(0, 3) : (cleanName + 'SCH').substring(0, 3);
      schoolCode = `SCH-${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const classesStr = Array.isArray(classes) ? classes.join(',') : (classes || '');
    const subjectsStr = Array.isArray(subjects) ? subjects.join(',') : (subjects || '');

    const [result] = await pool.execute(
      'INSERT INTO schools (name, code, contact_person, email, phone, board, city, address, classes, subjects, student_strength, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        name, 
        schoolCode, 
        contactPerson || null, 
        email, 
        phone || null, 
        board || null, 
        city || null, 
        address || null, 
        classesStr || null, 
        subjectsStr || null, 
        studentStrength ? parseInt(studentStrength) : 0, 
        hashedPassword
      ]
    );

    res.status(201).json({
      message: 'School created successfully',
      schoolId: result.insertId,
      code: schoolCode
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400);
      return next(new Error('School code or email already exists'));
    }
    next(error);
  }
};

const getExams = async (req, res, next) => {
  try {
    const [exams] = await pool.query('SELECT e.*, s.name as subject_name FROM exams e JOIN subjects s ON e.subject_id = s.id');
    res.json(exams);
  } catch (error) {
    next(error);
  }
};

const bulkAddSchools = async (req, res, next) => {
  try {
    const { schools } = req.body;
    if (!schools || !Array.isArray(schools)) {
      res.status(400);
      throw new Error('Please provide an array of schools');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('school123', salt);

    const values = schools.map(s => {
      let schoolCode = s.code;
      if (!schoolCode) {
        const cleanName = s.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const prefix = cleanName.length >= 3 ? cleanName.substring(0, 3) : (cleanName + 'SCH').substring(0, 3);
        schoolCode = `SCH-${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
      }
      const classesStr = Array.isArray(s.classes) ? s.classes.join(',') : (s.classes || '');
      const subjectsStr = Array.isArray(s.subjects) ? s.subjects.join(',') : (s.subjects || '');
      
      return [
        s.name,
        schoolCode,
        s.contactPerson || null,
        s.email,
        s.phone || null,
        s.board || null,
        s.city || null,
        s.address || null,
        classesStr || null,
        subjectsStr || null,
        s.studentStrength ? parseInt(s.studentStrength) : 0,
        hashedPassword
      ];
    });
    
    await pool.query(
      'INSERT INTO schools (name, code, contact_person, email, phone, board, city, address, classes, subjects, student_strength, password_hash) VALUES ?',
      [values]
    );

    res.status(201).json({ message: `${schools.length} schools uploaded successfully` });
  } catch (error) {
    next(error);
  }
};

const bulkAddStudents = async (req, res, next) => {
  try {
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
      s.schoolId, 
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

const addStudent = async (req, res, next) => {
  try {
    const { fullName, studentClass, schoolId, board, email, phone, username, password } = req.body;
    
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

const deleteStudent = async (req, res, next) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM students WHERE id = ?', [id]);
    res.json({ message: 'Student deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const updateStudentStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['Active', 'Inactive'].includes(status)) {
      res.status(400);
      throw new Error('Invalid status');
    }
    await pool.execute('UPDATE students SET status = ? WHERE id = ?', [status, id]);
    res.json({ message: `Student status updated to ${status}` });
  } catch (error) {
    next(error);
  }
};

const deleteSchool = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Check if school has students
    const [students] = await pool.query('SELECT id FROM students WHERE school_id = ?', [id]);
    if (students.length > 0) {
      res.status(400);
      throw new Error('Cannot delete school with existing students. Delete or move students first.');
    }
    await pool.execute('DELETE FROM schools WHERE id = ?', [id]);
    res.json({ message: 'School deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const updateSchoolStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['Active', 'Inactive'].includes(status)) {
      res.status(400);
      throw new Error('Invalid status');
    }
    await pool.execute('UPDATE schools SET status = ? WHERE id = ?', [status, id]);
    res.json({ message: `School status updated to ${status}` });
  } catch (error) {
    next(error);
  }
};

// Boards Management
const getBoards = async (req, res, next) => {
    try {
        const [boards] = await pool.query('SELECT * FROM boards ORDER BY name');
        res.json(boards);
    } catch (error) { next(error); }
};
const addBoard = async (req, res, next) => {
    try {
        const { name, description } = req.body;
        await pool.execute('INSERT INTO boards (name, description) VALUES (?, ?)', [name, description]);
        res.status(201).json({ message: 'Board added successfully' });
    } catch (error) { next(error); }
};
const deleteBoard = async (req, res, next) => {
    try {
        const { id } = req.params;
        await pool.execute('DELETE FROM boards WHERE id = ?', [id]);
        res.json({ message: 'Board deleted successfully' });
    } catch (error) { next(error); }
};

// Classes Management
const getClasses = async (req, res, next) => {
    try {
        const [classes] = await pool.query('SELECT * FROM classes ORDER BY level');
        res.json(classes);
    } catch (error) { next(error); }
};
const addClass = async (req, res, next) => {
    try {
        const { name, level } = req.body;
        await pool.execute('INSERT INTO classes (name, level) VALUES (?, ?)', [name, level]);
        res.status(201).json({ message: 'Class added successfully' });
    } catch (error) { next(error); }
};
const deleteClass = async (req, res, next) => {
    try {
        const { id } = req.params;
        await pool.execute('DELETE FROM classes WHERE id = ?', [id]);
        res.json({ message: 'Class deleted successfully' });
    } catch (error) { next(error); }
};

// Topics Management
const getTopics = async (req, res, next) => {
    try {
        const [topics] = await pool.query('SELECT t.*, s.name as subject_name FROM topics t JOIN subjects s ON t.subject_id = s.id ORDER BY s.name, t.name');
        res.json(topics);
    } catch (error) { next(error); }
};
const addTopic = async (req, res, next) => {
    try {
        const { subjectId, name, description } = req.body;
        await pool.execute('INSERT INTO topics (subject_id, name, description) VALUES (?, ?, ?)', [subjectId, name, description]);
        res.status(201).json({ message: 'Topic added successfully' });
    } catch (error) { next(error); }
};
const deleteTopic = async (req, res, next) => {
    try {
        const { id } = req.params;
        await pool.execute('DELETE FROM topics WHERE id = ?', [id]);
        res.json({ message: 'Topic deleted successfully' });
    } catch (error) { next(error); }
};

// Subjects Management
const getSubjects = async (req, res, next) => {
    try {
        const [subjects] = await pool.query('SELECT * FROM subjects ORDER BY name');
        res.json(subjects);
    } catch (error) { next(error); }
};
const addSubject = async (req, res, next) => {
    try {
        const { code, name, duration, questions } = req.body;
        await pool.execute('INSERT INTO subjects (code, name, default_duration, default_questions) VALUES (?, ?, ?, ?)', [code, name, duration, questions]);
        res.status(201).json({ message: 'Subject added successfully' });
    } catch (error) { next(error); }
};
const deleteSubject = async (req, res, next) => {
    try {
        const { id } = req.params;
        await pool.execute('DELETE FROM subjects WHERE id = ?', [id]);
        res.json({ message: 'Subject deleted successfully' });
    } catch (error) { next(error); }
};

module.exports = {
  createExam,
  getExams,
  addQuestion,
  deleteQuestion,
  getStats,
  getStudents,
  getSchools,
  getResults,
  getQuestions,
  addSchool,
  addStudent,
  bulkAddSchools,
  bulkAddStudents,
  deleteStudent,
  updateStudentStatus,
  deleteSchool,
  updateSchoolStatus,
  getBoards,
  addBoard,
  deleteBoard,
  getClasses,
  addClass,
  deleteClass,
  getTopics,
  addTopic,
  deleteTopic,
  getSubjects,
  addSubject,
  deleteSubject
};
