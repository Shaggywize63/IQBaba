const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const { errorHandler } = require('./middleware/errorMiddleware');

// Load env vars (try backend/.env first, then fallback to root .env using absolute paths)
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const port = process.env.PORT || 5000;
let BASE_PATH = process.env.BASE_PATH || '';
if (BASE_PATH && !BASE_PATH.startsWith('/')) BASE_PATH = '/' + BASE_PATH;
if (BASE_PATH.endsWith('/')) BASE_PATH = BASE_PATH.slice(0, -1);

const app = express();

// Security middleware (Removed to fix CSP issues)
// app.use(helmet({
//   contentSecurityPolicy: false,
//   crossOriginResourcePolicy: false,
// }));

// CORS config
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Request logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Force permissive CSP for demo
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline'; img-src * data:; font-src *; connect-src *;");
  next();
});

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Static files path (normalized)
const staticPath = path.resolve(__dirname, '..');

// Explicit route for / to serve index.html
app.get('/', (req, res) => {
  res.sendFile('index.html', { root: staticPath });
});

// Static files (from the root directory)
app.use(express.static(staticPath));

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/exams', require('./routes/examRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/schools', require('./routes/schoolRoutes'));
app.use('/api/students', require('./routes/studentRoutes'));

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'API is running fast and secure!' });
});

// Support for BASE_PATH if set
if (BASE_PATH && BASE_PATH !== '/') {
  console.log(`Mounting app on BASE_PATH: ${BASE_PATH}`);
  const baseRouter = express.Router();
  baseRouter.use(express.static(staticPath));
  baseRouter.get('/', (req, res) => res.sendFile(path.join(staticPath, 'index.html')));
  app.use(BASE_PATH, baseRouter);
}

// Error handling middleware
app.use(errorHandler);

app.listen(port, () => console.log(`Server started on port ${port}`));

// Keep process alive
setInterval(() => {}, 1000 * 60 * 60);

process.on('exit', (code) => {
  console.log(`About to exit with code: ${code}`);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
