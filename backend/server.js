const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const { errorHandler } = require('./middleware/errorMiddleware');

// Load env vars (try backend/.env first, then fallback to root .env using absolute paths)
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Run migrations automatically on startup
require('./migrate-db');

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

// API Routes. Built as one router so it can be mounted under BASE_PATH as well
// as at the root: the pages derive their API URL from their own location, so a
// deployment under a sub-path asks for <BASE_PATH>/api/... .
const apiRouter = express.Router();
apiRouter.use('/auth', require('./routes/authRoutes'));
apiRouter.use('/exams', require('./routes/examRoutes'));
apiRouter.use('/admin', require('./routes/adminRoutes'));
apiRouter.use('/schools', require('./routes/schoolRoutes'));
apiRouter.use('/students', require('./routes/studentRoutes'));
apiRouter.use('/support', require('./routes/supportRoutes'));

// Health check
apiRouter.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'API is running fast and secure!' });
});

// Anything else under /api is a wrong URL or a wrong method. Express's default
// 404 is an HTML page, which the browser's response.json() then fails to parse
// with a message that says nothing useful ("The string did not match the
// expected pattern." in Safari), so answer in JSON like every other endpoint.
apiRouter.use((req, res) => {
  res.status(404).json({
    message: `No API endpoint for ${req.method} ${req.baseUrl}${req.path}`
  });
});

app.use('/api', apiRouter);

// Support for BASE_PATH if set
if (BASE_PATH && BASE_PATH !== '/') {
  console.log(`Mounting app on BASE_PATH: ${BASE_PATH}`);
  const baseRouter = express.Router();
  baseRouter.use('/api', apiRouter);
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
