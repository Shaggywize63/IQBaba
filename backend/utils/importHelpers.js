/**
 * Shared normalisation/validation helpers used by the bulk-import endpoints.
 *
 * Bulk imports are row-tolerant on purpose: one malformed row must not abort the
 * whole upload, so every endpoint inserts row by row and reports the rejects back
 * to the caller instead of throwing.
 */

const str = value => (value === undefined || value === null ? '' : String(value).trim());

const optional = value => {
  const s = str(value);
  return s === '' ? null : s;
};

/** Pick the first non-empty value from a set of candidate keys on a row. */
const pick = (row, ...keys) => {
  for (const key of keys) {
    const value = str(row[key]);
    if (value !== '') return value;
  }
  return '';
};

const isValidEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/** "class 7", "VII grade", "7" -> "7" (kept as a string, matching class_level). */
const normalizeClassLevel = value => {
  const s = str(value);
  if (s === '') return '';
  const digits = s.match(/\d+/);
  return digits ? digits[0] : s;
};

const DIFFICULTIES = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const normalizeDifficulty = value => DIFFICULTIES[str(value).toLowerCase()] || null;

const normalizeQuestionType = value => {
  const s = str(value).toLowerCase();
  if (s === '' ) return 'Single';
  if (['multiple', 'multi', 'msq', 'multiple choice', 'multiple selection'].includes(s)) return 'Multiple';
  if (['single', 'mcq', 'single choice'].includes(s)) return 'Single';
  return null;
};

const normalizeStatus = value => {
  const s = str(value).toLowerCase();
  if (s === '' ) return null;
  if (['active', 'enabled', 'yes', '1', 'true'].includes(s)) return 'Active';
  if (['inactive', 'disabled', 'no', '0', 'false'].includes(s)) return 'Inactive';
  return null;
};

/**
 * "A", "a", "1", "Option A" -> "A". Accepts comma/pipe/space separated lists for
 * multiple-selection questions and returns them sorted and de-duplicated ("A,C").
 */
const normalizeCorrectOption = (value, questionType) => {
  const raw = str(value);
  if (raw === '') return null;

  // Drop any "Option"/"Options" wording first so it survives being used as a
  // separator ("Option A, Option C") as well as a prefix ("OptionA").
  const tokens = raw.replace(/options?/gi, ' ').split(/[,|/;\s]+/).map(t => t.trim()).filter(Boolean);
  const letters = [];

  for (const token of tokens) {
    let letter = null;
    const cleaned = token.toUpperCase();
    if (/^[ABCD]$/.test(cleaned)) {
      letter = cleaned;
    } else if (/^[1-4]$/.test(cleaned)) {
      letter = String.fromCharCode(64 + parseInt(cleaned, 10)); // 1 -> A
    } else {
      return null;
    }
    if (!letters.includes(letter)) letters.push(letter);
  }

  if (letters.length === 0) return null;
  if (questionType === 'Single' && letters.length > 1) return null;

  letters.sort();
  return letters.join(',');
};

/** Turn a comma separated cell ("Class 6, Class 7") into a clean comma string. */
const normalizeList = value => {
  if (Array.isArray(value)) {
    const items = value.map(str).filter(Boolean);
    return items.length ? items.join(',') : null;
  }
  const s = str(value);
  if (s === '') return null;
  const items = s.split(',').map(v => v.trim()).filter(Boolean);
  return items.length ? items.join(',') : null;
};

/** Deterministic-prefix school code, e.g. "Delhi Public School" -> SCH-DEL-4821. */
const generateSchoolCode = name => {
  const clean = str(name).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const prefix = clean.length >= 3 ? clean.substring(0, 3) : (clean + 'SCH').substring(0, 3);
  return `SCH-${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
};

/** Translate a MySQL error into something an admin can act on. */
const describeDbError = (error, context = {}) => {
  if (error && error.code === 'ER_DUP_ENTRY') {
    const message = String(error.message || '');
    if (/username/i.test(message)) return 'Username already exists';
    if (/email/i.test(message)) return 'Email already exists';
    if (/code/i.test(message)) return 'School code already exists';
    return `Duplicate value: ${context.duplicateHint || 'this record already exists'}`;
  }
  if (error && error.code === 'ER_NO_REFERENCED_ROW_2') {
    return 'Referenced record (school/subject/topic) does not exist';
  }
  if (error && error.code === 'ER_DATA_TOO_LONG') {
    return 'One of the values is too long for its column';
  }
  return (error && error.message) || 'Unknown database error';
};

module.exports = {
  str,
  optional,
  pick,
  isValidEmail,
  normalizeClassLevel,
  normalizeDifficulty,
  normalizeQuestionType,
  normalizeStatus,
  normalizeCorrectOption,
  normalizeList,
  generateSchoolCode,
  describeDbError
};
