/**
 * Sensitive-payload protection for OTP-bearing notification jobs.
 *
 * The queue is durable by design (a retry hours later must still render the
 * data as it was at emit time), so an OTP cannot simply live only in memory.
 * Instead of persisting the code in plaintext in NotificationJob /
 * NotificationLog, the code is encrypted (AES-256-GCM) at enqueue time and
 * decrypted only inside the Worker immediately before rendering. The job row,
 * the NotificationLog payload snapshot, and every log/error string therefore
 * never contain the live code.
 *
 * Scope is deliberately narrow and path-aware — NOT a generic "redact every
 * numeric field" pass, which would corrupt legitimate data (coupon codes,
 * amounts, IDs):
 *   - payload.otp            (canonical OTP object / string)
 *   - payload.verificationCode / payload.resetCode (defensive alternates)
 *
 * Key comes from OTP_ENCRYPTION_KEY, falling back to JWT_SECRET (present in
 * every environment that can sign a session, which every OTP flow needs).
 */

const crypto = require('crypto');

const PREFIX = 'otpenc:v1:';
const REDACTED = '[REDACTED]';
const SENSITIVE_TOP_LEVEL_KEYS = ['verificationCode', 'resetCode'];

function encryptionKey() {
  const secret = process.env.OTP_ENCRYPTION_KEY
    || process.env.JWT_SECRET
    || 'zutsav-notification-otp-fallback-key';
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function encrypt(plaintext) {
  if (plaintext === undefined || plaintext === null || plaintext === '') return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

function decrypt(value) {
  if (!isEncrypted(value)) return value;
  try {
    const parts = value.slice(PREFIX.length).split('.');
    if (parts.length !== 3) return '';
    const [ivB64, tagB64, dataB64] = parts;
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    // Never throw from a retry path — an undecryptable code renders blank and
    // the mapping's required-variable validation skips the send safely.
    return '';
  }
}

/** Apply `transform` (encrypt/decrypt) to the sensitive paths; returns a new
 * object so callers never mutate the shared payload while iterating
 * recipients. Non-sensitive leaves are shared by reference (Dates preserved). */
function mapSensitive(payload, transform) {
  if (!payload || typeof payload !== 'object') return payload;
  const out = { ...payload };
  if (out.otp !== undefined && out.otp !== null) {
    if (typeof out.otp === 'string') {
      out.otp = transform(out.otp);
    } else if (typeof out.otp === 'object' && out.otp.code !== undefined) {
      out.otp = { ...out.otp, code: transform(out.otp.code) };
    }
  }
  for (const key of SENSITIVE_TOP_LEVEL_KEYS) {
    if (typeof out[key] === 'string' && out[key] !== '') out[key] = transform(out[key]);
  }
  return out;
}

/** Snapshot safe to persist/enqueue — OTP is stored as ciphertext. */
function redactSensitivePayload(payload) {
  return mapSensitive(payload, encrypt);
}

/** Restore plaintext for rendering immediately before a send. */
function rehydrateSensitivePayload(payload) {
  return mapSensitive(payload, decrypt);
}

/** Plaintext sensitive values present in a (rehydrated) payload, for scrubbing
 * any rendered/logged text that might echo them. */
function collectSensitiveValues(payload) {
  const values = [];
  if (typeof payload?.otp === 'string') values.push(payload.otp);
  else if (payload?.otp && typeof payload.otp === 'object' && payload.otp.code) {
    values.push(String(payload.otp.code));
  }
  for (const key of SENSITIVE_TOP_LEVEL_KEYS) {
    if (typeof payload?.[key] === 'string' && payload[key]) values.push(payload[key]);
  }
  // Ignore trivially short values — replacing a 1-2 char string globally in
  // log text would redact unrelated content. Real OTPs are 6 digits.
  return [...new Set(values.filter((v) => typeof v === 'string' && v.length >= 3))];
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replace every occurrence of a sensitive value inside a string. */
function scrubText(text, secrets) {
  if (!text || !secrets || secrets.length === 0) return text;
  const re = new RegExp(secrets.map(escapeRegExp).join('|'), 'g');
  return String(text).replace(re, REDACTED);
}

function isPlainObject(v) {
  if (!v || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Deep-clone a value, scrubbing sensitive values from every string leaf.
 * Only plain objects are traversed — Buffers/ObjectIds/Dates pass through. */
function scrubDeep(value, secrets) {
  if (!secrets || secrets.length === 0) return value;
  if (typeof value === 'string') return scrubText(value, secrets);
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, secrets));
  if (isPlainObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = scrubDeep(v, secrets);
    return out;
  }
  return value;
}

module.exports = {
  PREFIX,
  REDACTED,
  redactSensitivePayload,
  rehydrateSensitivePayload,
  collectSensitiveValues,
  isEncrypted,
  scrubText,
  scrubDeep,
};
