/**
 * Company billing registration service — the single backend-controlled source
 * of truth for "Bill From" identities on manual invoices.
 *
 * Registrations live in SystemSettings.companyBillingRegistrations (admin
 * managed). When none are configured the service exposes ONE fallback
 * registration derived from the historically printed frontend company config.
 * The fallback is explicitly marked `isFallback: true` / `isVerified: false`
 * and must be confirmed by the Admin before a tax invoice is finalized —
 * it is never silently presented as independently verified legal information.
 *
 * GSTIN format is validated structurally only (state code + embedded PAN +
 * checksum shape). Format validity is NOT proof that the registration is
 * genuine or registered — that remains an Admin/legal responsibility.
 */

const settingsService = require('./settingsService');

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RE   = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

// Value previously hardcoded in frontend/src/config/company.config.js.
// Centralized here so the fallback exists in exactly one place.
const RECOMMENDED_FALLBACK = Object.freeze({
  id:        'fallback',
  legalName: 'Zutsav Enterprises',
  gstin:     '07AACCZ8054C1ZB',
  pan:       'AACCZ8054C',
  address:   'PLOT NO 23 KH NO 61/13, KALAN EXTENSION, POLE: MDKW622, New Delhi',
  state:     'Delhi',
  stateCode: '07',
  isActive:  true,
  isDefault: true,
  isFallback: true,
  isVerified: false,
});

function normalizeGstin(value) {
  return String(value || '').toUpperCase().replace(/\s+/g, '');
}

/** Structural GSTIN validation: format + state-code/stateCode + embedded PAN. */
function validateGstin(gstin, { pan = '', stateCode = '' } = {}) {
  const g = normalizeGstin(gstin);
  const errors = [];
  if (!GSTIN_RE.test(g)) {
    errors.push('GSTIN must be 15 characters: 2-digit state code, 10-character PAN, entity code, "Z", check character');
    return errors;
  }
  const embeddedPan = g.slice(2, 12);
  const prefix      = g.slice(0, 2);
  if (pan && String(pan).toUpperCase() !== embeddedPan) {
    errors.push(`PAN does not match the PAN embedded in the GSTIN (${embeddedPan})`);
  }
  if (stateCode && String(stateCode) !== prefix) {
    errors.push(`State code does not match the GSTIN state prefix (${prefix})`);
  }
  return errors;
}

function validatePan(pan) {
  if (!pan) return [];
  return PAN_RE.test(String(pan).toUpperCase())
    ? []
    : ['PAN must be 5 letters, 4 digits, 1 letter (e.g. AACCZ8054C)'];
}

/**
 * Validate an array of registration inputs. Returns { registrations, errors }.
 * Normalizes ids, derives stateCode from the GSTIN, and enforces at most one
 * default. Unknown/extra keys are dropped (never persisted blindly).
 */
function validateRegistrations(input) {
  const errors = [];
  const list = Array.isArray(input) ? input : [];
  if (list.length > 20) errors.push('At most 20 billing registrations are supported');

  const seenIds = new Set();
  let defaultCount = 0;
  const registrations = list.map((raw, i) => {
    const r = raw && typeof raw === 'object' ? raw : {};
    const gstin     = normalizeGstin(r.gstin);
    const pan       = String(r.pan || '').toUpperCase().replace(/\s+/g, '');
    const legalName = String(r.legalName || '').trim();
    const state     = String(r.state || '').trim();
    let   stateCode = String(r.stateCode || '').trim();
    let   id        = String(r.id || '').trim();

    if (!id) id = `reg_${Date.now().toString(36)}_${i}`;
    if (seenIds.has(id)) { errors.push(`Duplicate registration id: ${id}`); }
    seenIds.add(id);

    if (!legalName) errors.push(`Registration ${i + 1}: legal business name is required`);
    if (!state)     errors.push(`Registration ${i + 1}: registered state is required`);
    if (!gstin)     errors.push(`Registration ${i + 1}: GSTIN is required`);
    else errors.push(...validateGstin(gstin, { pan, stateCode }).map((e) => `Registration ${i + 1}: ${e}`));
    errors.push(...validatePan(pan).map((e) => `Registration ${i + 1}: ${e}`));

    // Derive/confirm the state code from the GSTIN prefix (authoritative).
    if (GSTIN_RE.test(gstin)) stateCode = gstin.slice(0, 2);

    const isDefault = Boolean(r.isDefault);
    if (isDefault) defaultCount += 1;

    return {
      id,
      legalName,
      gstin,
      pan,
      address:   String(r.address || '').trim(),
      state,
      stateCode,
      isActive:  r.isActive !== false,
      isDefault,
    };
  });

  if (defaultCount > 1) errors.push('Only one registration can be marked as default');
  return { registrations, errors };
}

/** All registrations (configured + fallback when nothing is configured). */
async function getRegistrations() {
  const configured = await settingsService.get('companyBillingRegistrations', []);
  const list = Array.isArray(configured) ? configured : [];
  if (list.length === 0) return [{ ...RECOMMENDED_FALLBACK }];
  return list.map((r) => ({
    ...r,
    isFallback: false,
    isVerified: true, // configured by an Admin in System Settings
  }));
}

/** Active registrations offered in the Manual Billing form. */
async function getActiveRegistrations() {
  const all = await getRegistrations();
  return all.filter((r) => r.isActive !== false || r.isFallback === true);
}

/**
 * Resolve a registration by id for a bill. Throws a typed error when the id is
 * unknown or inactive — the controller maps it to HTTP 400.
 */
async function resolveRegistration(registrationId) {
  const active = await getActiveRegistrations();
  const id = String(registrationId || '').trim();
  // No id supplied → preselect the configured/fallback default (the Admin
  // still sees exactly which registration was used in the response).
  const found = id
    ? active.find((r) => String(r.id) === id)
    : (active.find((r) => r.isDefault) || active[0]);
  if (!found) {
    const err = new Error('Selected company billing registration is missing or inactive');
    err.status = 400;
    err.statusCode = 400;
    throw err;
  }
  if (found.isFallback) {
    const { ...rest } = found;
    return { ...rest, stateCode: rest.stateCode || (rest.gstin || '').slice(0, 2) };
  }
  return { ...found, stateCode: found.stateCode || (found.gstin || '').slice(0, 2) };
}

/** Default registration for preselection (first default-active, else fallback). */
async function getDefaultRegistration() {
  const active = await getActiveRegistrations();
  return active.find((r) => r.isDefault) || active[0] || { ...RECOMMENDED_FALLBACK };
}

module.exports = {
  RECOMMENDED_FALLBACK,
  GSTIN_RE,
  PAN_RE,
  normalizeGstin,
  validateGstin,
  validatePan,
  validateRegistrations,
  getRegistrations,
  getActiveRegistrations,
  getDefaultRegistration,
  resolveRegistration,
};
