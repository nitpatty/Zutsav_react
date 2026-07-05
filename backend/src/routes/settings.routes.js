const router = require('express').Router();
const SystemSettings = require('../models/SystemSettings');

const PUBLIC_FIELDS = 'platformName logo contactEmail supportPhone supportAddress ' +
  'privacyUrl termsUrl contactUrl helpCenterUrl whatsappNumber customerCareNumber deployWebsiteUrl';

const DEFAULTS = {
  platformName: 'Zutsav', logo: '', contactEmail: '', supportPhone: '', supportAddress: '',
  privacyUrl: '', termsUrl: '', contactUrl: '', helpCenterUrl: '',
  whatsappNumber: '', customerCareNumber: '', deployWebsiteUrl: '',
};

// GET /api/settings/public — no auth required
// Returns only the branding/contact/URL fields safe for public consumption
// (never a secret — see src/config/configManifest.js for what's admin-editable
// here vs. server-side only). Consumed by SettingsContext.jsx so the
// System Configuration Center's Company/Frontend/Communication tabs take
// effect on the live site without a rebuild.
router.get('/public', async (req, res) => {
  try {
    const s = (await SystemSettings.findOne().select(PUBLIC_FIELDS).lean()) || {};
    const settings = {};
    for (const key of Object.keys(DEFAULTS)) settings[key] = s[key] || DEFAULTS[key];
    res.json({ success: true, settings });
  } catch {
    res.json({ success: true, settings: DEFAULTS });
  }
});

module.exports = router;
