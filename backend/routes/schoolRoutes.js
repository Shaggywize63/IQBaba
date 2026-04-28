const express = require('express');
const router = express.Router();
const { getSchoolStudents, getSchoolResults, getSchoolStats, addStudent, bulkAddStudents } = require('../controllers/schoolController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All routes here are protected and require 'school' role
router.use(protect);
router.use(authorize('school'));

router.get('/students', getSchoolStudents);
router.post('/students', addStudent);
router.post('/students/bulk', bulkAddStudents);
router.get('/results', getSchoolResults);
router.get('/stats', getSchoolStats);

module.exports = router;
