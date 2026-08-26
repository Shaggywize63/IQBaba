// First line of the process. If Runtime Logs stay empty after a request, the
// start command was never run at all — nothing below had a chance to fail.
console.log(`[boot] node ${process.version} starting ${__filename}`);

// Captured before dotenv runs. dotenv does not overwrite a variable that is
// already set, so anything recorded here came from the platform and wins;
// anything missing here will be filled from a .env file on disk. The port
// matters most: a hosting platform assigns one and proxies to it, and a
// PORT in a committed .env would otherwise send the app to a different one,
// leaving the proxy with nothing to talk to.
const PLATFORM_ENV = {
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV,
  DB_USER: process.env.DB_USER,
  DB_NAME: process.env.DB_NAME
};

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const { errorHandler } = require('./middleware/errorMiddleware');

// Load env vars (try backend/.env first, then fallback to root .env using absolute paths)
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Loaded, not run: migrations happen after the port is bound, below.
const migrate = require('./migrate-db');

const port = process.env.PORT || 5000;
let BASE_PATH = process.env.BASE_PATH || '';
if (BASE_PATH && !BASE_PATH.startsWith('/')) BASE_PATH = '/' + BASE_PATH;
if (BASE_PATH.endsWith('/')) BASE_PATH = BASE_PATH.slice(0, -1);

const app = express();

// Helmet supplies the headers that carry no risk here - nosniff, frameguard,
// referrer policy, HSTS. Its Content-Security-Policy is off because these
// pages are written with inline <script> blocks and need a hand-written one,
// set below. Resources stay cross-origin readable so the pages can be served
// from a different host than the API.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false
}));

// CORS. ALLOWED_ORIGINS is a comma-separated list, e.g.
//   ALLOWED_ORIGINS=https://iqbaba.in,https://www.iqbaba.in
// Without it every origin is allowed, which is not what a portal holding
// student records should run on - hence the warning at startup.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(o => o.trim()).filter(Boolean);

if (ALLOWED_ORIGINS.length === 0) {
  console.warn('[cors] ALLOWED_ORIGINS is not set, so any site may call this API. ' +
    'Set it to your own origins, comma separated.');
}

app.use(cors({
  origin: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Request logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Content-Security-Policy.
//
// 'unsafe-inline' stays for scripts and styles: every page carries inline
// <script> blocks and inline style attributes, and removing it would need all
// of them rewritten. Everything else is now named rather than left as *, and
// 'unsafe-eval' is gone - nothing in this codebase evaluates strings.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  `connect-src 'self'${ALLOWED_ORIGINS.length ? ' ' + ALLOWED_ORIGINS.join(' ') : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
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

app.listen(port, () => {
  const source = PLATFORM_ENV.PORT
    ? 'assigned by the platform'
    : (process.env.PORT ? 'from a .env file - the platform did not set one' : 'built-in default');
  console.log(`Server started on port ${port} (${source})`);
  console.log(`[env] NODE_ENV=${process.env.NODE_ENV || 'unset'} ` +
    `DB_USER=${process.env.DB_USER || 'unset'} DB_NAME=${process.env.DB_NAME || 'unset'} ` +
    `(from the platform: ${Object.entries(PLATFORM_ENV).filter(([, v]) => v).map(([k]) => k).join(', ') || 'nothing'})`);

  // Migrations run only once the port is bound, and can never stop the app
  // from serving. A database that is unreachable now shows up as a JSON error
  // from the API rather than a dead process behind the platform's 503 page.
  migrate()
    .then(() => console.log('Startup migrations finished.'))
    .catch(error => console.error('Startup migrations failed:', error.message));
});

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
