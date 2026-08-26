const express = require('express');
const router = express.Router();
const { registerStudent, loginUser, getPublicSchools, getPublicBoards } = require('../controllers/authController');

router.post('/register/student', registerStudent);
router.post('/login', loginUser);
router.get('/schools', getPublicSchools);
router.get('/boards', getPublicBoards);

module.exports = router;
