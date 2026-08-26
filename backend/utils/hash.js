/**
 * Password hashing, via bcrypt where its native binding loads and bcryptjs
 * where it does not.
 *
 * bcrypt ships prebuilt binaries per platform, Node version and libc. On
 * shared hosting a mismatch is common, and `require('bcrypt')` then throws
 * while the module is being loaded — before any error handler exists, so the
 * process dies with no request ever served. The platform turns that into a
 * 503 HTML page, which is what makes the browser's response.json() fail.
 *
 * bcryptjs is a pure-JavaScript implementation of the same algorithm with the
 * same API, and reads hashes bcrypt wrote, so existing passwords keep working.
 * It is slower, which for a login endpoint does not matter.
 */
let bcrypt;
let implementation;

try {
  bcrypt = require('bcrypt');
  implementation = 'bcrypt';
} catch (error) {
  bcrypt = require('bcryptjs');
  implementation = 'bcryptjs';
  console.warn(`[hash] bcrypt did not load (${error.message.split('\n')[0]}); using bcryptjs instead.`);
}

module.exports = bcrypt;
module.exports.implementation = implementation;
