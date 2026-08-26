/**
 * Entry point for hosting platforms that look for app.js at the project root.
 *
 * Hostinger's Node.js Web App has an "Entry file" setting that defaults to
 * app.js. The server actually lives in backend/server.js, so without this file
 * the platform starts nothing: no process, no runtime log, and every /api
 * request falls through to the static file handler as a 404.
 *
 * Keep it a one-liner. All the real setup belongs in backend/server.js, which
 * `npm start` also runs directly.
 */
require('./backend/server.js');
