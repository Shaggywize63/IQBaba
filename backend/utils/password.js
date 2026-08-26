/**
 * Per-account passwords.
 *
 * Every account used to get the same one - password123 for students,
 * school123 for schools - written into a public repository. Knowing one
 * account's password meant knowing them all.
 *
 * These are typed by hand off a screen or a printed list, so the alphabet
 * leaves out characters that are read wrongly: O/0, I/l/1, and anything that
 * depends on the font to tell apart.
 */
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const DEFAULT_LENGTH = 12;

const generatePassword = (length = DEFAULT_LENGTH) => {
  // randomInt is rejection-sampled, so every character is equally likely -
  // `% ALPHABET.length` over random bytes would not be.
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return out;
};

module.exports = { generatePassword, PASSWORD_ALPHABET: ALPHABET, DEFAULT_LENGTH };
