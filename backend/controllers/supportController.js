const pool = require('../config/db');

// @desc    Submit support request
// @route   POST /api/support/contact
// @access  Public
const createSupportMessage = async (req, res, next) => {
  try {
    const { name, email, role, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      res.status(400);
      throw new Error('Please provide name, email, subject and message');
    }

    const [result] = await pool.execute(
      'INSERT INTO support_messages (name, email, role, subject, message) VALUES (?, ?, ?, ?, ?)',
      [name, email, role || 'Guest', subject, message]
    );

    res.status(201).json({
      success: true,
      message: 'Support message received successfully. We will contact you soon.',
      messageId: result.insertId
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createSupportMessage
};
