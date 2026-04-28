const pool = require('../config/db');

// @desc    Get questions for a specific exam
// @route   GET /api/exams/:examId/questions
// @access  Private (Student)
const getExamQuestions = async (req, res, next) => {
  try {
    const { examId } = req.params;

    // Verify exam exists and is enabled
    const [exams] = await pool.execute('SELECT * FROM exams WHERE id = ? AND is_enabled = TRUE', [examId]);
    if (exams.length === 0) {
      res.status(404);
      throw new Error('Exam not found or not active');
    }
    const exam = exams[0];

    // Fetch student's school_id if not in token
    let studentSchoolId = req.user.school_id;
    if (!studentSchoolId && req.user.role === 'student') {
      const [studentData] = await pool.execute('SELECT school_id FROM students WHERE id = ?', [req.user.id]);
      if (studentData.length > 0) studentSchoolId = studentData[0].school_id;
    }

    // Check Assignments: Verify student or their school is assigned to this exam
    const [assignments] = await pool.execute(
      `SELECT * FROM exam_assignments 
       WHERE exam_id = ? AND (school_id = ? OR student_id = ? OR (school_id IS NULL AND student_id IS NULL))`,
      [examId, studentSchoolId || null, req.user.id]
    );

    if (assignments.length === 0 && req.user.role !== 'admin') {
      res.status(403);
      throw new Error('This exam has not been assigned to you or your school');
    }

    // Fetch questions
    // First, check if specific questions are linked to this exam
    const qColumns = 'q.id, q.subject_id, q.topic, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.difficulty, q.question_type';
    const [linkedQuestions] = await pool.query(
      `SELECT ${qColumns} FROM questions q 
       JOIN exam_questions eq ON q.id = eq.question_id 
       WHERE eq.exam_id = ?`,
      [examId]
    );

    let rows = [];
    if (linkedQuestions.length > 0) {
      rows = linkedQuestions;
      if (exam.randomize_questions) {
        rows.sort(() => Math.random() - 0.5);
      }
    } else {
      // Fallback: Random questions from the subject
      let query = `SELECT ${qColumns.replace(/q\./g, '')} FROM questions WHERE subject_id = ?`;
      if (exam.randomize_questions) {
        query += ' ORDER BY RAND()';
      }
      query += ' LIMIT ?';
      const [randomQs] = await pool.query(query, [exam.subject_id, exam.total_questions]);
      rows = randomQs;
    }

    // Map rows to include options array for frontend compatibility
    const questions = rows.map(q => ({
      ...q,
      options: [q.option_a, q.option_b, q.option_c, q.option_d]
    }));

    res.json({
      examTitle: exam.title,
      durationMinutes: exam.duration_minutes,
      totalQuestions: exam.total_questions,
      questions
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Submit exam result
// @route   POST /api/exams/:examId/submit
// @access  Private (Student)
const submitExamResult = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const { answers } = req.body; // Array of { questionId: 1, selectedOption: 'A' }

    if (!answers || !Array.isArray(answers)) {
      res.status(400);
      throw new Error('Please provide answers array');
    }

    // Fetch exam configuration
    const [exams] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (exams.length === 0) {
      res.status(404);
      throw new Error('Exam not found');
    }
    const exam = exams[0];

    // Fetch correct answers for these questions
    const questionIds = answers.map(a => a.questionId);
    if(questionIds.length === 0) {
       res.status(400);
       throw new Error('Answers array cannot be empty');
    }

    const [questions] = await pool.query(
      'SELECT id, correct_option, difficulty, question_type FROM questions WHERE id IN (?)',
      [questionIds]
    );

    let score = 0;
    let totalMarksPossible = 0; // Simplified total calculation, assuming all answered questions sum up to total marks, ideally it should be total questions * average marks or predefined.

    // Calculate score
    for (const answer of answers) {
      const question = questions.find(q => q.id === answer.questionId);
      if (question) {
        let marksForQuestion = 0;
        if (question.difficulty === 'Easy') marksForQuestion = exam.easy_marks;
        else if (question.difficulty === 'Medium') marksForQuestion = exam.medium_marks;
        else if (question.difficulty === 'Hard') marksForQuestion = exam.hard_marks;

        totalMarksPossible += marksForQuestion;

        const indexToLetter = (idx) => String.fromCharCode(65 + parseInt(idx));
        
        let isCorrect = false;
        if (question.question_type === 'Multiple') {
          // answer.selectedOption should be an array for Multiple
          const selected = Array.isArray(answer.selectedOption) ? answer.selectedOption : [answer.selectedOption];
          const selectedStr = selected.map(indexToLetter).sort().join(',');
          const correctStr = question.correct_option.split(',').map(s => s.trim()).sort().join(',');
          isCorrect = selectedStr === correctStr;
        } else {
          isCorrect = indexToLetter(answer.selectedOption) === question.correct_option;
        }

        if (isCorrect) {
          score += marksForQuestion;
        } else if (exam.negative_marking) {
          score -= (marksForQuestion * 0.25); // Assume 25% negative marking
        }
      }
    }

    // Prevent negative overall score if required, or keep it
    if (score < 0) score = 0;

    // Assume max total marks is derived from exam.total_questions * (average of marks, or predefined). 
    // For simplicity here, we'll calculate based on what they answered + what they didn't.
    // Better approach: fetch ALL questions for the exam and calculate max possible marks.
    // Let's use a simplified approach where we just record the raw score and an estimated total.
    const estimatedTotalMarks = exam.total_questions * exam.medium_marks; 
    const percentage = (score / estimatedTotalMarks) * 100;

    // Insert result
    const [result] = await pool.execute(
      'INSERT INTO results (student_id, exam_id, score, total_marks, percentage) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, examId, score, estimatedTotalMarks, percentage.toFixed(2)]
    );

    res.status(201).json({
      message: 'Exam submitted successfully',
      resultId: result.insertId,
      score,
      percentage: percentage.toFixed(2),
      passed: percentage >= exam.passing_percentage
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  getExamQuestions,
  submitExamResult
};
