/**
 * Where the API lives.
 *
 * Leave this empty when the same server serves both these pages and the API —
 * the pages then derive it from their own address, which is what a plain
 * `node backend/server.js` deployment does.
 *
 * Set it when the two are separate. On shared hosting (Hostinger and similar)
 * the HTML in public_html is served by the web server, while the Node app runs
 * on its own port or its own subdomain; a request to /api then reaches the web
 * server, which knows nothing about it and answers with its own 404 page. That
 * HTML is what makes a login fail with "The string did not match the expected
 * pattern." and leaves every dropdown on its built-in fallback list.
 *
 * Examples:
 *   window.IQBABA_API_BASE = 'https://api.iqbaba.in';
 *   window.IQBABA_API_BASE = 'https://iqbaba.in:3000';
 *
 * With or without a trailing /api — both work.
 */
window.IQBABA_API_BASE = '';
