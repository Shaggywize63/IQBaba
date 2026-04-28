const pool = require('../config/db');

// @desc    Get student dashboard data
// @route   GET /api/students/dashboard
// @access  Private (Student)
const getStudentDashboard = async (req, res, next) => {
  try {
    const studentId = req.user.id;

    // Fetch enrolled subjects
    const [enrolledSubjects] = await pool.execute(`
      SELECT s.id, s.name, s.code
      FROM student_subjects ss
      JOIN subjects s ON ss.subject_id = s.id
      WHERE ss.student_id = ?
    `, [studentId]);

    // Fetch past results
    const [pastResults] = await pool.execute(`
      SELECT r.id, e.title as exam_title, r.score, r.percentage, r.date_taken
      FROM results r
      JOIN exams e ON r.exam_id = e.id
      WHERE r.student_id = ?
      ORDER BY r.date_taken DESC
    `, [studentId]);

    // Fetch student's school_id
    const [studentData] = await pool.execute('SELECT school_id FROM students WHERE id = ?', [studentId]);
    const studentSchoolId = studentData.length > 0 ? studentData[0].school_id : null;

    // Fetch upcoming exams (exams assigned to the student or their school)
    const [exams] = await pool.query(`
      SELECT DISTINCT e.id, e.title, e.schedule_date, e.duration_minutes, s.name as subject_name
      FROM exams e
      JOIN subjects s ON e.subject_id = s.id
      JOIN exam_assignments ea ON e.id = ea.exam_id
      WHERE e.is_enabled = TRUE
      AND (ea.student_id = ? OR ea.school_id = ? OR (ea.school_id IS NULL AND ea.student_id IS NULL))
      ORDER BY e.schedule_date ASC
    `, [studentId, studentSchoolId]);
    upcomingExams = exams;

    res.json({
      enrolledSubjects,
      pastResults,
      upcomingExams,
      stats: {
        examsTaken: pastResults.length,
        averageScore: pastResults.length > 0 ? (pastResults.reduce((acc, curr) => acc + parseFloat(curr.percentage), 0) / pastResults.length).toFixed(2) : 0
      }
    });

  } catch (error) {
    next(error);
  }
};

const getProfile = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const [students] = await pool.execute('SELECT * FROM students WHERE id = ?', [studentId]);
    
    if (students.length === 0) {
      res.status(404);
      throw new Error('Student not found');
    }

    const [subjects] = await pool.execute('SELECT subject_id FROM student_subjects WHERE student_id = ?', [studentId]);
    
    const student = students[0];
    delete student.password_hash;

    res.json({
      ...student,
      subjects: subjects.map(s => s.subject_id)
    });
  } catch (error) {
    next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const { fullName, studentClass, schoolId, board, email, phone, subjects } = req.body;

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      await connection.execute(
        'UPDATE students SET full_name = ?, class_level = ?, school_id = ?, board = ?, email = ?, phone = ? WHERE id = ?',
        [fullName, studentClass, schoolId, board, email, phone, studentId]
      );

      if (subjects && Array.isArray(subjects)) {
        await connection.execute('DELETE FROM student_subjects WHERE student_id = ?', [studentId]);
        for (const subjectId of subjects) {
          await connection.execute('INSERT INTO student_subjects (student_id, subject_id) VALUES (?, ?)', [studentId, subjectId]);
        }
      }

      await connection.commit();
      res.json({ message: 'Profile updated successfully' });
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

module.exports = {
  getStudentDashboard,
  getProfile,
  updateProfile
};
