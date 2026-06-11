const express = require('express');
const router = express.Router();
const { registerStudent, loginUser, getPublicSchools } = require('../controllers/authController');

router.post('/register/student', registerStudent);
router.post('/login', loginUser);
router.get('/schools', getPublicSchools);

module.exports = router;
