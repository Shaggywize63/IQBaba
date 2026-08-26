const errorHandler = (err, req, res, next) => {
  console.error(`ERROR [${req.method}] ${req.url}:`, err.message);
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
  // Opt in to stack traces rather than out of them: a deployment that forgets
  // to set NODE_ENV would otherwise hand every visitor an internal stack.
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : null,
  });
};

module.exports = { errorHandler };
