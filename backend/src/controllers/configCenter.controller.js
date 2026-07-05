const axios = require('axios');
const mongoose = require('mongoose');

const SystemSettings = require('../models/SystemSettings');
const ConfigVersion = require('../models/ConfigVersion');
const AdminAuditLog = require('../models/AdminAuditLog');
const settingsService = require('../utils/settingsService');
const { MANIFEST, SECTIONS, forSection, findByKey } = require('../config/configManifest');
const { validateField } = require('../utils/configValidation');
const { getIntegrationStatuses } = require('../config/healthReport');

const ALL_KEYS = MANIFEST.map((f) => f.key);

// GET /api/admin/config-center/manifest
exports.getManifest = (req, res) => {
  const grouped = {};
  for (const section of SECTIONS) grouped[section] = forSection(section);
  res.json({ success: true, manifest: grouped });
};

// GET /api/admin/config-center
exports.getCurrentValues = async (req, res, next) => {
  try {
    const doc = (await SystemSettings.findOne().lean()) || {};
    const values = {};
    for (const key of ALL_KEYS) values[key] = doc[key] || '';
    res.json({ success: true, values });
  } catch (err) { next(err); }
};

function clientIp(req) {
  return req.ip || req.connection?.remoteAddress || '';
}

// PATCH /api/admin/config-center/:section
exports.updateSection = async (req, res, next) => {
  try {
    const { section } = req.params;
    if (!SECTIONS.includes(section)) {
      return res.status(400).json({ success: false, message: `Unknown section "${section}"` });
    }

    const fields = forSection(section);
    const allowedKeys = new Set(fields.map((f) => f.key));

    // Only manifest keys for THIS section may be written — structurally
    // impossible for this endpoint to touch a secret or an unrelated field,
    // regardless of what the request body contains.
    const incoming = {};
    for (const [key, value] of Object.entries(req.body || {})) {
      if (allowedKeys.has(key)) incoming[key] = value;
    }

    const errors = [];
    for (const field of fields) {
      if (!(field.key in incoming)) continue;
      const err = validateField(field, incoming[field.key]);
      if (err) errors.push(err);
    }
    if (errors.length) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }

    const before = (await SystemSettings.findOne().lean()) || {};
    const changedFields = [];
    for (const key of Object.keys(incoming)) {
      const oldValue = String(before[key] || '');
      const newValue = String(incoming[key] || '');
      if (oldValue !== newValue) changedFields.push({ field: key, oldValue, newValue });
    }

    if (!changedFields.length) {
      return res.json({ success: true, settings: before, appliedImmediately: [], requiresRebuild: [], unchanged: true });
    }

    const updated = await SystemSettings.findOneAndUpdate(
      {},
      { $set: incoming },
      { upsert: true, new: true, runValidators: true }
    ).lean();

    settingsService.invalidate();

    const snapshot = {};
    for (const key of ALL_KEYS) snapshot[key] = updated[key] || '';

    await ConfigVersion.create({
      section,
      snapshot,
      changedFields,
      updatedBy: req.user._id,
      updatedByName: req.user.name || req.user.email || 'Admin',
      ipAddress: clientIp(req),
      action: 'update',
    }).catch(() => {});

    await AdminAuditLog.create({
      action: 'config_center_update',
      performedBy: req.user._id,
      performedByName: req.user.name || req.user.email || 'Admin',
      targetType: 'SystemConfiguration',
      note: `Updated ${section}: ${changedFields.map((c) => c.field).join(', ')}`,
    }).catch(() => {});

    const appliedImmediately = [];
    const requiresRebuild = [];
    for (const { field: key } of changedFields) {
      const manifestField = findByKey(key);
      (manifestField?.liveApply ? appliedImmediately : requiresRebuild).push(key);
    }

    res.json({ success: true, settings: updated, appliedImmediately, requiresRebuild });
  } catch (err) { next(err); }
};

// GET /api/admin/config-center/history?section=&page=
exports.getHistory = async (req, res, next) => {
  try {
    const { section } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 20;
    const filter = section ? { section } : {};

    const [versions, total] = await Promise.all([
      ConfigVersion.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-snapshot')
        .lean(),
      ConfigVersion.countDocuments(filter),
    ]);

    res.json({ success: true, versions, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
};

// GET /api/admin/config-center/history/compare?a=&b=
exports.compareHistory = async (req, res, next) => {
  try {
    const { a, b } = req.query;
    if (!a || !b) return res.status(400).json({ success: false, message: 'Both a and b version ids are required' });

    const [versionA, versionB] = await Promise.all([
      ConfigVersion.findById(a).lean(),
      ConfigVersion.findById(b).lean(),
    ]);
    if (!versionA || !versionB) return res.status(404).json({ success: false, message: 'Version not found' });

    const diff = [];
    for (const key of ALL_KEYS) {
      const va = versionA.snapshot?.[key] || '';
      const vb = versionB.snapshot?.[key] || '';
      if (va !== vb) diff.push({ field: key, a: va, b: vb });
    }

    res.json({ success: true, a: versionA, b: versionB, diff });
  } catch (err) { next(err); }
};

// POST /api/admin/config-center/history/:id/restore
exports.restoreVersion = async (req, res, next) => {
  try {
    const version = await ConfigVersion.findById(req.params.id).lean();
    if (!version) return res.status(404).json({ success: false, message: 'Version not found' });

    // Only manifest-covered keys are ever restored — secrets can never
    // appear in a snapshot in the first place, so this is safe by construction.
    const restoreFields = {};
    for (const key of ALL_KEYS) {
      if (key in (version.snapshot || {})) restoreFields[key] = version.snapshot[key];
    }

    const before = (await SystemSettings.findOne().lean()) || {};
    const changedFields = [];
    for (const key of Object.keys(restoreFields)) {
      const oldValue = String(before[key] || '');
      const newValue = String(restoreFields[key] || '');
      if (oldValue !== newValue) changedFields.push({ field: key, oldValue, newValue });
    }

    const updated = await SystemSettings.findOneAndUpdate(
      {},
      { $set: restoreFields },
      { upsert: true, new: true, runValidators: true }
    ).lean();

    settingsService.invalidate();

    const snapshot = {};
    for (const key of ALL_KEYS) snapshot[key] = updated[key] || '';

    await ConfigVersion.create({
      section: version.section,
      snapshot,
      changedFields,
      updatedBy: req.user._id,
      updatedByName: req.user.name || req.user.email || 'Admin',
      ipAddress: clientIp(req),
      action: 'restore',
      note: `Restored from version ${version._id}`,
    }).catch(() => {});

    await AdminAuditLog.create({
      action: 'config_center_restore',
      performedBy: req.user._id,
      performedByName: req.user.name || req.user.email || 'Admin',
      targetType: 'SystemConfiguration',
      note: `Restored ${version.section} to version from ${version.createdAt}`,
    }).catch(() => {});

    res.json({ success: true, settings: updated, changedFields });
  } catch (err) { next(err); }
};

// ── Verify Configuration ──────────────────────────────────────────────────

async function pingUrl(url, path = '') {
  if (!url) return { status: 'not_configured', message: 'Not configured' };
  try {
    const target = path ? `${url.replace(/\/$/, '')}${path}` : url;
    const start = Date.now();
    const res = await axios.get(target, { timeout: 5000, validateStatus: () => true });
    const ms = Date.now() - start;
    if (res.status >= 200 && res.status < 400) {
      return { status: 'healthy', message: `Reachable (HTTP ${res.status}, ${ms}ms)` };
    }
    return { status: 'warning', message: `Responded with HTTP ${res.status}` };
  } catch (err) {
    if (err.code === 'ECONNABORTED') return { status: 'error', message: 'Timed out after 5s' };
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      return { status: 'error', message: `Unreachable (${err.code})` };
    }
    return { status: 'error', message: err.message || 'Request failed' };
  }
}

async function pingMongo() {
  try {
    if (mongoose.connection.readyState !== 1) return { status: 'error', message: 'Not connected' };
    await mongoose.connection.db.admin().ping();
    return { status: 'healthy', message: 'Connected and responding' };
  } catch (err) {
    return { status: 'error', message: err.message || 'Ping failed' };
  }
}

const INTEGRATION_STATUS_MAP = {
  connected: 'healthy',
  configured: 'healthy',
  not_configured: 'warning',
  not_integrated: 'info',
  offline: 'error',
};

// GET /api/admin/config-center/verify
exports.verifyConfiguration = async (req, res, next) => {
  try {
    const settings = (await SystemSettings.findOne().lean()) || {};

    const [website, backendApi, mobileApi, mongoStatus, integrationStatuses] = await Promise.all([
      pingUrl(settings.deployWebsiteUrl),
      pingUrl(settings.deployApiUrl, '/api/health'),
      pingUrl(settings.deployMobileApiUrl || settings.deployApiUrl, '/api/health'),
      pingMongo(),
      getIntegrationStatuses(),
    ]);

    const results = [
      { key: 'website', label: 'Website URL', ...website },
      { key: 'backendApi', label: 'Backend Reachability', ...backendApi },
      { key: 'mobileApi', label: 'Mobile API', ...mobileApi },
      { key: 'database', label: 'Database Connectivity', ...mongoStatus },
      ...integrationStatuses
        .filter((s) => s.key !== 'database')
        .map((s) => ({
          key: s.key,
          label: s.label,
          status: INTEGRATION_STATUS_MAP[s.status] || 'warning',
          message: s.status === 'configured' ? 'Configured'
            : s.status === 'not_configured' ? 'Not configured'
            : s.status === 'not_integrated' ? 'Not integrated in this codebase'
            : s.status,
        })),
      { key: 'clarity', label: 'Microsoft Clarity', status: 'info', message: 'Frontend-only analytics — configured via REACT_APP_MICROSOFT_CLARITY_PROJECT_ID, not applicable here.' },
      { key: 'bhashini', label: 'BHASHINI', status: 'info', message: 'Not integrated anywhere in this codebase.' },
    ];

    res.json({ success: true, results, checkedAt: new Date() });
  } catch (err) { next(err); }
};
