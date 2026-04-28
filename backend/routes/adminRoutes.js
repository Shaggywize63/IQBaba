const express = require('express');
const router = express.Router();
const { 
  createExam, getExams, addQuestion, deleteQuestion, getStats, getStudents, getSchools, getResults, getQuestions, 
  addSchool, addStudent, bulkAddSchools, bulkAddStudents,
  deleteStudent, updateStudentStatus, deleteSchool, updateSchoolStatus,
  getBoards, addBoard, deleteBoard, getClasses, addClass, deleteClass,
  getTopics, addTopic, deleteTopic, getSubjects, addSubject, deleteSubject
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All routes here are protected and require 'admin' role
router.use(protect);
router.use(authorize('admin'));

router.post('/exams', createExam);
router.get('/exams', getExams);
router.post('/questions', addQuestion);
router.post('/schools', addSchool);
router.post('/schools/bulk', bulkAddSchools);
router.delete('/schools/:id', deleteSchool);
router.put('/schools/:id/status', updateSchoolStatus);

router.post('/students', addStudent);
router.post('/students/bulk', bulkAddStudents);
router.delete('/students/:id', deleteStudent);
router.put('/students/:id/status', updateStudentStatus);

router.get('/stats', getStats);
router.get('/students', getStudents);
router.get('/schools', getSchools);
router.get('/results', getResults);
router.get('/questions', getQuestions);
router.delete('/questions/:id', deleteQuestion);

// Other Management
router.get('/boards', getBoards);
router.post('/boards', addBoard);
router.delete('/boards/:id', deleteBoard);

router.get('/classes', getClasses);
router.post('/classes', addClass);
router.delete('/classes/:id', deleteClass);

router.get('/topics', getTopics);
router.post('/topics', addTopic);
router.delete('/topics/:id', deleteTopic);

router.get('/subjects', getSubjects);
router.post('/subjects', addSubject);
router.delete('/subjects/:id', deleteSubject);

module.exports = router;
