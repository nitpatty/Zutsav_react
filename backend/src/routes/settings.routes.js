const router = require('express').Router();
const SystemSettings = require('../models/SystemSettings');
const { toPublicFooterLinks } = require('../utils/footerLinks');

const PUBLIC_FIELDS = 'platformName logo contactEmail supportPhone supportAddress ' +
  'whatsappNumber customerCareNumber deployWebsiteUrl urgentBookingCutoffTime footerLinks';

const DEFAULTS = {
  platformName: 'Zutsav', logo: '', contactEmail: '', supportPhone: '', supportAddress: '',
  whatsappNumber: '', customerCareNumber: '', deployWebsiteUrl: '',
  urgentBookingCutoffTime: '18:30',
};
// Not part of the scalar DEFAULTS loop below: footerLinks is converted through an
// explicit allowlist DTO (enabled links only; no storage paths or internal fields).
const withFooterLinks = (settings, links) => ({ ...settings, footerLinks: toPublicFooterLinks(links) });

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
    res.json({ success: true, settings: withFooterLinks(settings, s.footerLinks) });
  } catch {
    res.json({ success: true, settings: withFooterLinks(DEFAULTS, []) });
  }
});

module.exports = router;
