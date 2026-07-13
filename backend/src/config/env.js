/**
 * Environment loader — single place that touches `dotenv`.
 *
 * Load order: `.env.${NODE_ENV}` first, then `.env` fills in anything the
 * environment-specific file didn't set (dotenv never overwrites a key that's
 * already present in process.env). This lets a deployment ship a
 * `.env.production` with just the values that differ from `.env` without
 * duplicating every key.
 */

const path = require('path');
const dotenv = require('dotenv');

const NODE_ENV = process.env.NODE_ENV || 'development';
const ROOT = path.resolve(__dirname, '../../');

dotenv.config({ path: path.join(ROOT, `.env.${NODE_ENV}`) });
dotenv.config({ path: path.join(ROOT, '.env') });

/**
 * Read an env var by its canonical `name`, falling back to legacy/alternate
 * names if the canonical one isn't set. Lets older deployments keep working
 * without editing source when a var gets renamed for consistency.
 */
function readEnv(name, ...aliases) {
  for (const key of [name, ...aliases]) {
    if (process.env[key] !== undefined && process.env[key] !== '') return process.env[key];
  }
  return undefined;
}

module.exports = { NODE_ENV, readEnv };
