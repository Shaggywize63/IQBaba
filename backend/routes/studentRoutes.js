const express = require('express');
const router = express.Router();
const { getStudentDashboard, getProfile, updateProfile } = require('../controllers/studentController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All routes here are protected and require 'student' role
router.use(protect);
router.use(authorize('student'));

router.get('/dashboard', getStudentDashboard);
router.get('/profile', getProfile);
router.put('/profile', updateProfile);

module.exports = router;
