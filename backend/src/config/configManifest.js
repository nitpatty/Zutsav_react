/**
 * System Configuration Center — field manifest.
 *
 * Single source of truth for every admin-editable runtime setting exposed
 * by the Config Center. The frontend renders its tabs/fields FROM this
 * manifest (via GET /api/admin/config-center/manifest) instead of each
 * field being hand-coded — adding a future setting (a CDN URL, a new
 * payment gateway's public config, etc.) means adding one entry here, not
 * writing new React form code.
 *
 * `PATCH /api/admin/config-center/:section` validates incoming field keys
 * against this manifest and rejects anything not listed for that section —
 * this is what makes it structurally impossible for this endpoint to ever
 * read or write a secret field (JWT_SECRET, PhonePe salt key, Groq API key,
 * SMTP password, etc.), not just a filter someone could forget.
 *
 * type:      'url' | 'email' | 'phone' | 'text'  — drives client validation
 * liveApply: true  = takes effect immediately (backend reads it via
 *                     settingsService on every use, or CORS is dynamic)
 *            false = requires a frontend/mobile rebuild + redeploy to take
 *                     effect (CRA/Expo bake these into the compiled build)
 */

const MANIFEST = [
  // ── Deployment ─────────────────────────────────────────────────────────
  { key: 'deployWebsiteUrl', section: 'deployment', label: 'Website URL', type: 'url', required: true, liveApply: true,
    helpText: 'The public website URL. Used in CORS, emails, and generated links.' },
  { key: 'deployApiUrl', section: 'deployment', label: 'Backend API URL', type: 'url', required: true, liveApply: true,
    helpText: "This backend's own public URL. Used for payment webhook callbacks and generated links." },
  { key: 'deployAdminUrl', section: 'deployment', label: 'Admin Panel URL', type: 'url', required: false, liveApply: true,
    helpText: 'Defaults to the Website URL if left blank.' },
  { key: 'deployMobileApiUrl', section: 'deployment', label: 'Mobile API URL', type: 'url', required: false, liveApply: true,
    helpText: 'Usually the same as Backend API URL. Kept separate for a future dedicated mobile API gateway.' },
  { key: 'deploySocketUrl', section: 'deployment', label: 'WebSocket URL', type: 'url', required: false, liveApply: true,
    helpText: 'Future use — leave blank to use the Backend API URL host.' },
  { key: 'deployCdnUrl', section: 'deployment', label: 'CDN URL', type: 'url', required: false, liveApply: true,
    helpText: 'Future use — not yet consumed by any app.' },

  // ── Company ────────────────────────────────────────────────────────────
  { key: 'companyGstin', section: 'company', label: 'GSTIN', type: 'text', required: false, liveApply: true,
    helpText: 'Shown on generated invoices.' },
  { key: 'companyPan', section: 'company', label: 'PAN', type: 'text', required: false, liveApply: true,
    helpText: 'Shown on generated invoices.' },
  { key: 'companyState', section: 'company', label: 'Registered State', type: 'text', required: false, liveApply: true,
    helpText: 'Used to determine interstate vs intrastate GST on invoices.' },

  // ── Mobile ─────────────────────────────────────────────────────────────
  { key: 'mobileSupportUrl', section: 'mobile', label: 'Support URL', type: 'url', required: false, liveApply: false,
    helpText: 'Requires a new mobile app build (EAS) to take effect on already-installed apps.' },

  // ── Communication ──────────────────────────────────────────────────────
  { key: 'contactEmail', section: 'communication', label: 'Support Email', type: 'email', required: false, liveApply: true },
  { key: 'supportPhone', section: 'communication', label: 'Support Phone', type: 'phone', required: false, liveApply: true },
  { key: 'whatsappNumber', section: 'communication', label: 'WhatsApp Number', type: 'phone', required: false, liveApply: true,
    helpText: 'Customer-facing WhatsApp number shown in the app — separate from the WhatsApp Business API credentials in System Settings.' },
  { key: 'customerCareNumber', section: 'communication', label: 'Customer Care Number', type: 'phone', required: false, liveApply: true },
];

const SECTIONS = ['deployment', 'company', 'mobile', 'communication'];

function forSection(section) {
  return MANIFEST.filter((f) => f.section === section);
}

function findByKey(key) {
  return MANIFEST.find((f) => f.key === key);
}

module.exports = { MANIFEST, SECTIONS, forSection, findByKey };
