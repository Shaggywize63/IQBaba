const pool = require('../config/db');
const bcrypt = require('../utils/hash');
const { generatePassword } = require('../utils/password');
const {
  str, optional, pick, isValidEmail, normalizeClassLevel, normalizeDifficulty,
  normalizeQuestionType, normalizeStatus, normalizeCorrectOption, normalizeList,
  generateSchoolCode, describeDbError
} = require('../utils/importHelpers');

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
    let query = 'SELECT s.*, sc.name as school_name FROM students s LEFT JOIN schools sc ON s.school_id = sc.id';
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
      SELECT r.id, s.full_name as student_name, sc.name as school_name, s.custom_school_name, e.title as exam_title, r.score, r.percentage, r.date_taken
      FROM results r
      JOIN students s ON r.student_id = s.id
      LEFT JOIN schools sc ON s.school_id = sc.id
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
    const plainPassword = req.body.password || generatePassword();
    const hashedPassword = await bcrypt.hash(plainPassword, salt);

    // Auto-generate school code if not provided
    const schoolCode = code || generateSchoolCode(name);

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

/**
 * Resolve a school reference coming from a spreadsheet cell. Accepts a numeric
 * id, a school code, or a case-insensitive school name.
 */
const buildSchoolLookup = async () => {
  const [schools] = await pool.query('SELECT id, name, code FROM schools');
  const byId = new Map();
  const byCode = new Map();
  const byName = new Map();
  schools.forEach(s => {
    byId.set(String(s.id), s.id);
    if (s.code) byCode.set(String(s.code).trim().toLowerCase(), s.id);
    byName.set(String(s.name).trim().toLowerCase(), s.id);
  });
  return { byId, byCode, byName };
};

const resolveSchoolId = (lookup, reference) => {
  const ref = str(reference);
  if (ref === '') return null;
  const key = ref.toLowerCase();
  return lookup.byId.get(ref) || lookup.byCode.get(key) || lookup.byName.get(key) || null;
};

// @desc    Bulk create schools from a CSV import
// @route   POST /api/admin/schools/bulk
// @access  Private (Admin)
const bulkAddSchools = async (req, res, next) => {
  try {
    const { schools } = req.body;
    if (!Array.isArray(schools) || schools.length === 0) {
      res.status(400);
      throw new Error('Please provide a non-empty array of schools');
    }

    const salt = await bcrypt.genSalt(10);
    // Generated per row below, so an import does not give every school the
    // same password.

    const failed = [];
    const created = [];
    // Codes/emails repeated *within the same file* would otherwise fail with an
    // opaque duplicate-key error, so track what this batch has already used.
    const seenEmails = new Set();
    const seenCodes = new Set();

    for (let i = 0; i < schools.length; i++) {
      const row = schools[i] || {};
      const rowNum = i + 1;
      const name = str(row.name);
      const email = str(row.email).toLowerCase();

      const reject = error => failed.push({ index: rowNum, identifier: name || email || `Row ${rowNum}`, error });

      if (!name) { reject('School name is required'); continue; }
      if (!email) { reject('Email is required'); continue; }
      if (!isValidEmail(email)) { reject(`"${email}" is not a valid email address`); continue; }
      if (seenEmails.has(email)) { reject(`Email "${email}" appears more than once in this file`); continue; }

      let code = str(row.code);
      if (code && seenCodes.has(code.toLowerCase())) { reject(`School code "${code}" appears more than once in this file`); continue; }
      if (!code) {
        // Retry a few times so a random collision inside one batch is not fatal.
        do { code = generateSchoolCode(name); } while (seenCodes.has(code.toLowerCase()));
      }

      const status = row.status ? normalizeStatus(row.status) : 'Active';
      if (row.status && !status) { reject(`Status must be Active or Inactive (got "${row.status}")`); continue; }

      const strengthRaw = str(row.studentStrength);
      const strength = strengthRaw === '' ? 0 : parseInt(strengthRaw, 10);
      if (Number.isNaN(strength) || strength < 0) { reject(`Student strength must be a positive number (got "${strengthRaw}")`); continue; }

      const plainPassword = str(row.password) || generatePassword();
      const passwordHash = await bcrypt.hash(plainPassword, salt);

      try {
        const [result] = await pool.execute(
          `INSERT INTO schools (name, code, contact_person, email, phone, board, city, address, classes, subjects, student_strength, password_hash, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            name,
            code,
            optional(row.contactPerson),
            email,
            optional(row.phone),
            optional(row.board),
            optional(row.city),
            optional(row.address),
            normalizeList(row.classes),
            normalizeList(row.subjects),
            strength,
            passwordHash,
            status || 'Active'
          ]
        );
        seenEmails.add(email);
        seenCodes.add(code.toLowerCase());
        created.push({ id: result.insertId, name, code, email, password: plainPassword });
      } catch (error) {
        reject(describeDbError(error, { duplicateHint: `${name} / ${email}` }));
      }
    }

    res.status(failed.length === schools.length ? 400 : 201).json({
      message: `${created.length} of ${schools.length} school(s) uploaded successfully`,
      inserted: created.length,
      created,
      failed
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Bulk create students from a CSV import
// @route   POST /api/admin/students/bulk
// @access  Private (Admin)
const bulkAddStudents = async (req, res, next) => {
  try {
    const { students } = req.body;
    if (!Array.isArray(students) || students.length === 0) {
      res.status(400);
      throw new Error('Please provide a non-empty array of students');
    }

    const salt = await bcrypt.genSalt(10);
    // Generated per row below, so an import does not give every student the
    // same password.
    const schoolLookup = await buildSchoolLookup();

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

      // A student either belongs to a registered school or carries the school
      // name as free text (the "unregistered school" flow used by self-signup).
      const schoolRef = str(row.schoolId) || str(row.schoolCode) || str(row.schoolName);
      const schoolId = resolveSchoolId(schoolLookup, schoolRef);
      let customSchoolName = null;
      if (!schoolId) {
        if (!schoolRef) { reject('School is required (give the school name, code or id)'); continue; }
        customSchoolName = schoolRef;
      }

      const status = row.status ? normalizeStatus(row.status) : 'Active';
      if (row.status && !status) { reject(`Status must be Active or Inactive (got "${row.status}")`); continue; }

      const plainPassword = str(row.password) || generatePassword();
      const passwordHash = await bcrypt.hash(plainPassword, salt);

      try {
        const [result] = await pool.execute(
          `INSERT INTO students (full_name, username, password_hash, class_level, school_id, custom_school_name, board, city, email, phone, status, registration_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            fullName,
            username,
            passwordHash,
            classLevel,
            schoolId,
            customSchoolName,
            board,
            optional(row.city),
            optional(email),
            optional(row.phone),
            status || 'Active',
            regDate
          ]
        );
        seenUsernames.add(username.toLowerCase());
        created.push({ id: result.insertId, fullName, username, password: plainPassword });
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

// @desc    Bulk create questions from a CSV import
// @route   POST /api/admin/questions/bulk
// @access  Private (Admin)
const bulkAddQuestions = async (req, res, next) => {
  try {
    const { questions } = req.body;
    if (!Array.isArray(questions) || questions.length === 0) {
      res.status(400);
      throw new Error('Please provide a non-empty array of questions');
    }

    const [subjects] = await pool.query('SELECT id, name, code FROM subjects');
    const [topics] = await pool.query('SELECT id, subject_id, name FROM topics');

    const subjectById = new Map(subjects.map(s => [String(s.id), s]));
    const subjectByName = new Map(subjects.map(s => [String(s.name).trim().toLowerCase(), s]));
    const subjectByCode = new Map(subjects.filter(s => s.code).map(s => [String(s.code).trim().toLowerCase(), s]));

    const resolveSubject = reference => {
      const ref = str(reference);
      if (ref === '') return null;
      const key = ref.toLowerCase();
      return subjectById.get(ref) || subjectByCode.get(key) || subjectByName.get(key) || null;
    };

    const resolveTopic = (subjectId, reference) => {
      const ref = str(reference);
      if (ref === '') return null;
      const key = ref.toLowerCase();
      return topics.find(t =>
        t.subject_id === subjectId && (String(t.id) === ref || String(t.name).trim().toLowerCase() === key)
      ) || null;
    };

    const failed = [];
    const created = [];

    for (let i = 0; i < questions.length; i++) {
      const row = questions[i] || {};
      const rowNum = i + 1;
      const text = str(row.text);
      const preview = text.length > 45 ? `${text.slice(0, 45)}…` : text;

      const reject = error => failed.push({ index: rowNum, identifier: preview || `Row ${rowNum}`, error });

      const subject = resolveSubject(row.subject);
      if (!subject) { reject(`Unknown subject "${str(row.subject)}" — use a subject name or code that already exists`); continue; }

      if (!text) { reject('Question text is required'); continue; }

      const options = [str(row.optionA), str(row.optionB), str(row.optionC), str(row.optionD)];
      const missingOption = ['A', 'B', 'C', 'D'].find((letter, idx) => options[idx] === '');
      if (missingOption) { reject(`Option ${missingOption} is required`); continue; }

      const difficulty = normalizeDifficulty(row.difficulty);
      if (!difficulty) { reject(`Difficulty must be Easy, Medium or Hard (got "${str(row.difficulty)}")`); continue; }

      const questionType = normalizeQuestionType(row.questionType);
      if (!questionType) { reject(`Question type must be Single or Multiple (got "${str(row.questionType)}")`); continue; }

      const correctOption = normalizeCorrectOption(row.correctOption, questionType);
      if (!correctOption) {
        reject(questionType === 'Multiple'
          ? `Correct answer must be one or more of A,B,C,D (got "${str(row.correctOption)}")`
          : `Correct answer must be a single option A, B, C or D (got "${str(row.correctOption)}")`);
        continue;
      }

      // Topics are matched within the subject; an unmatched topic is still kept
      // as free text so the import does not lose information.
      const topicRef = str(row.topic);
      const topic = resolveTopic(subject.id, topicRef);

      try {
        const [result] = await pool.execute(
          `INSERT INTO questions (subject_id, topic_id, topic, question_text, option_a, option_b, option_c, option_d, question_type, correct_option, difficulty)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            subject.id,
            topic ? topic.id : null,
            topic ? topic.name : (topicRef || null),
            text,
            options[0], options[1], options[2], options[3],
            questionType,
            correctOption,
            difficulty
          ]
        );
        created.push({ id: result.insertId, text: preview });
      } catch (error) {
        reject(describeDbError(error));
      }
    }

    res.status(failed.length === questions.length ? 400 : 201).json({
      message: `${created.length} of ${questions.length} question(s) uploaded successfully`,
      inserted: created.length,
      created,
      failed
    });
  } catch (error) {
    next(error);
  }
};

const addStudent = async (req, res, next) => {
  try {
    const { fullName, studentClass, schoolId, board, city, email, phone, username, password } = req.body;
    
    const salt = await bcrypt.genSalt(10);
    const plainPassword = password || generatePassword();
    const hashedPassword = await bcrypt.hash(plainPassword, salt);

    const [result] = await pool.execute(
      'INSERT INTO students (full_name, username, password_hash, class_level, school_id, board, city, email, phone, registration_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
      [fullName, username, hashedPassword, studentClass, schoolId || null, board, optional(city), optional(email), optional(phone)]
    );

    res.status(201).json({
      message: 'Student created successfully',
      studentId: result.insertId,
      username,
      // Returned once so the screen can show it: it is not recoverable later.
      password: plainPassword
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

// @desc    Update an existing school
// @route   PUT /api/admin/schools/:id
// @access  Private (Admin)
const updateSchool = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, code, contactPerson, email, phone, board, city, address, classes, subjects, studentStrength, status, password } = req.body;

    const [existing] = await pool.execute('SELECT id FROM schools WHERE id = ?', [id]);
    if (existing.length === 0) {
      res.status(404);
      throw new Error('School not found');
    }

    if (!str(name)) {
      res.status(400);
      throw new Error('School name is required');
    }
    if (!str(email) || !isValidEmail(str(email))) {
      res.status(400);
      throw new Error('A valid email address is required');
    }
    if (status && !normalizeStatus(status)) {
      res.status(400);
      throw new Error('Status must be Active or Inactive');
    }

    const fields = {
      name: str(name),
      code: optional(code),
      contact_person: optional(contactPerson),
      email: str(email),
      phone: optional(phone),
      board: optional(board),
      city: optional(city),
      address: optional(address),
      classes: normalizeList(classes),
      subjects: normalizeList(subjects),
      student_strength: studentStrength === undefined || str(studentStrength) === '' ? 0 : parseInt(studentStrength, 10) || 0
    };
    if (status) fields.status = normalizeStatus(status);

    // Changing the portal password is optional — an empty field leaves it alone.
    if (str(password)) {
      const salt = await bcrypt.genSalt(10);
      fields.password_hash = await bcrypt.hash(str(password), salt);
    }

    const columns = Object.keys(fields);
    await pool.execute(
      `UPDATE schools SET ${columns.map(c => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...columns.map(c => fields[c]), id]
    );

    res.json({ message: 'School updated successfully' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400);
      return next(new Error(describeDbError(error)));
    }
    next(error);
  }
};

// @desc    Update an existing student
// @route   PUT /api/admin/students/:id
// @access  Private (Admin)
const updateStudent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { fullName, username, studentClass, schoolId, customSchoolName, board, city, email, phone, status, password } = req.body;

    const [existing] = await pool.execute('SELECT id FROM students WHERE id = ?', [id]);
    if (existing.length === 0) {
      res.status(404);
      throw new Error('Student not found');
    }

    if (!str(fullName)) {
      res.status(400);
      throw new Error('Full name is required');
    }
    if (!str(username)) {
      res.status(400);
      throw new Error('Username is required');
    }
    if (str(email) && !isValidEmail(str(email))) {
      res.status(400);
      throw new Error('Please provide a valid email address');
    }
    if (status && !normalizeStatus(status)) {
      res.status(400);
      throw new Error('Status must be Active or Inactive');
    }

    const resolvedSchoolId = str(schoolId) === '' ? null : parseInt(schoolId, 10);
    const fields = {
      full_name: str(fullName),
      username: str(username),
      class_level: normalizeClassLevel(studentClass),
      school_id: Number.isNaN(resolvedSchoolId) ? null : resolvedSchoolId,
      // A student linked to a registered school must not keep a stale free-text name.
      custom_school_name: resolvedSchoolId ? null : optional(customSchoolName),
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
      `UPDATE students SET ${columns.map(c => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...columns.map(c => fields[c]), id]
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

// @desc    Update an existing question
// @route   PUT /api/admin/questions/:id
// @access  Private (Admin)
const updateQuestion = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { subjectId, topicId, text, difficulty, options, questionType, correctAnswerIndex, correctOptions } = req.body;

    const [existing] = await pool.execute('SELECT id FROM questions WHERE id = ?', [id]);
    if (existing.length === 0) {
      res.status(404);
      throw new Error('Question not found');
    }

    if (!subjectId) {
      res.status(400);
      throw new Error('Subject is required');
    }
    if (!str(text)) {
      res.status(400);
      throw new Error('Question text is required');
    }
    if (!Array.isArray(options) || options.length < 4 || options.some(o => !str(o))) {
      res.status(400);
      throw new Error('All four options are required');
    }

    const normalizedDifficulty = normalizeDifficulty(difficulty);
    if (!normalizedDifficulty) {
      res.status(400);
      throw new Error('Difficulty must be Easy, Medium or Hard');
    }

    const type = normalizeQuestionType(questionType);
    if (!type) {
      res.status(400);
      throw new Error('Question type must be Single or Multiple');
    }

    const indexToLetter = idx => String.fromCharCode(65 + parseInt(idx, 10));
    let correctOptionStr;
    if (type === 'Multiple') {
      if (!Array.isArray(correctOptions) || correctOptions.length === 0) {
        res.status(400);
        throw new Error('Please select at least one correct option');
      }
      correctOptionStr = correctOptions.map(indexToLetter).sort().join(',');
    } else {
      if (correctAnswerIndex === undefined || correctAnswerIndex === null) {
        res.status(400);
        throw new Error('Please select the correct answer');
      }
      correctOptionStr = indexToLetter(correctAnswerIndex);
    }

    // Keep the denormalised topic name in sync with topic_id.
    let topicName = null;
    if (topicId) {
      const [topics] = await pool.execute('SELECT name FROM topics WHERE id = ?', [topicId]);
      if (topics.length > 0) topicName = topics[0].name;
    }

    await pool.execute(
      `UPDATE questions
       SET subject_id = ?, topic_id = ?, topic = ?, question_text = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?, question_type = ?, correct_option = ?, difficulty = ?
       WHERE id = ?`,
      [
        subjectId, topicId || null, topicName, str(text),
        str(options[0]), str(options[1]), str(options[2]), str(options[3]),
        type, correctOptionStr, normalizedDifficulty, id
      ]
    );

    res.json({ message: 'Question updated successfully' });
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
const updateBoard = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;
        if (!str(name)) {
            res.status(400);
            throw new Error('Board name is required');
        }
        const [result] = await pool.execute('UPDATE boards SET name = ?, description = ? WHERE id = ?', [str(name), optional(description), id]);
        if (result.affectedRows === 0) {
            res.status(404);
            throw new Error('Board not found');
        }
        res.json({ message: 'Board updated successfully' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(400);
            return next(new Error('A board with that name already exists'));
        }
        next(error);
    }
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
const updateClass = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, level } = req.body;
        if (!str(name)) {
            res.status(400);
            throw new Error('Class name is required');
        }
        const parsedLevel = parseInt(level, 10);
        if (Number.isNaN(parsedLevel)) {
            res.status(400);
            throw new Error('Class level must be a number');
        }
        const [result] = await pool.execute('UPDATE classes SET name = ?, level = ? WHERE id = ?', [str(name), parsedLevel, id]);
        if (result.affectedRows === 0) {
            res.status(404);
            throw new Error('Class not found');
        }
        res.json({ message: 'Class updated successfully' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(400);
            return next(new Error('A class with that name already exists'));
        }
        next(error);
    }
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
const updateTopic = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { subjectId, name, description } = req.body;
        if (!subjectId) {
            res.status(400);
            throw new Error('Subject is required');
        }
        if (!str(name)) {
            res.status(400);
            throw new Error('Topic name is required');
        }
        const [result] = await pool.execute(
            'UPDATE topics SET subject_id = ?, name = ?, description = ? WHERE id = ?',
            [subjectId, str(name), optional(description), id]
        );
        if (result.affectedRows === 0) {
            res.status(404);
            throw new Error('Topic not found');
        }
        // Questions cache the topic name, so refresh them alongside the rename.
        await pool.execute('UPDATE questions SET topic = ? WHERE topic_id = ?', [str(name), id]);
        res.json({ message: 'Topic updated successfully' });
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
const updateSubject = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { code, name, duration, questions } = req.body;
        if (!str(code) || !str(name)) {
            res.status(400);
            throw new Error('Subject code and name are required');
        }
        const [result] = await pool.execute(
            'UPDATE subjects SET code = ?, name = ?, default_duration = ?, default_questions = ? WHERE id = ?',
            [str(code), str(name), parseInt(duration, 10) || 0, parseInt(questions, 10) || 0, id]
        );
        if (result.affectedRows === 0) {
            res.status(404);
            throw new Error('Subject not found');
        }
        res.json({ message: 'Subject updated successfully' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(400);
            return next(new Error('A subject with that code already exists'));
        }
        next(error);
    }
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
  bulkAddQuestions,
  updateSchool,
  updateStudent,
  updateQuestion,
  deleteStudent,
  updateStudentStatus,
  deleteSchool,
  updateSchoolStatus,
  getBoards,
  addBoard,
  updateBoard,
  deleteBoard,
  getClasses,
  addClass,
  updateClass,
  deleteClass,
  getTopics,
  addTopic,
  updateTopic,
  deleteTopic,
  getSubjects,
  addSubject,
  updateSubject,
  deleteSubject
};
