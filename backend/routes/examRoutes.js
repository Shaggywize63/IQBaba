const express = require('express');
const router = express.Router();
const { getExamQuestions, submitExamResult } = require('../controllers/examController');
const { protect } = require('../middleware/authMiddleware');

router.get('/:examId/questions', protect, getExamQuestions);
router.post('/:examId/submit', protect, submitExamResult);

module.exports = router;
