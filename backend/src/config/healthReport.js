const { NODE_ENV, readEnv } = require('./env');
const urls = require('./urls.config');

const configured = (v) => Boolean(v && String(v).trim());

/**
 * Status of every integration that actually exists in this codebase.
 * Shared by the startup console report and the admin `/system-health` API
 * (`admin.controller.js#getSystemHealth`) so there's one source of truth for
 * "is X configured" instead of two independently-maintained checks.
 *
 * Cloudinary has schema fields and an env var but no SDK/upload code — it's
 * reported as "not integrated" rather than faked as configured/pending.
 * Microsoft Clarity (frontend-only) and BHASHINI (referenced in some specs)
 * do not exist anywhere in this codebase and are intentionally omitted here
 * — see DEPLOYMENT_CONFIGURATION.md for why.
 */
async function getIntegrationStatuses() {
  const settingsService = require('../utils/settingsService');
  const mongoose = require('mongoose');

  const [phonepeKey, groqKey, sarvamKey, cloudName, waToken, smtpUser, tekiEmail, razorpayKeyId] = await Promise.all([
    settingsService.get('phonepeMerchantId', readEnv('PHONEPE_MERCHANT_ID')),
    settingsService.get('groqApiKey', readEnv('GROQ_API_KEY')),
    settingsService.get('sarvamApiKey', readEnv('SARVAM_API_KEY')),
    settingsService.get('cloudinaryCloudName', readEnv('CLOUDINARY_CLOUD_NAME')),
    settingsService.get('whatsappAccessToken', readEnv('WHATSAPP_ACCESS_TOKEN')),
    settingsService.get('emailSmtpUser', readEnv('EMAIL_USER')),
    settingsService.get('tekipostApiKey', readEnv('TEKIPOST_EMAIL')),
    readEnv('RAZORPAY_KEY_ID'),
  ]);

  return [
    { key: 'database', label: 'MongoDB', status: mongoose.connection.readyState === 1 ? 'connected' : 'offline' },
    { key: 'razorpay', label: 'Razorpay (legacy)', status: configured(razorpayKeyId) ? 'configured' : 'not_configured' },
    { key: 'phonepe', label: 'PhonePe', status: configured(phonepeKey) ? 'configured' : 'not_configured' },
    { key: 'sarvam', label: 'Sarvam AI (Translation)', status: configured(sarvamKey) ? 'configured' : 'not_configured' },
    { key: 'groq', label: 'Groq AI (Assistant + Translation Fallback)', status: configured(groqKey) ? 'configured' : 'not_configured' },
    { key: 'email', label: 'SMTP / Email', status: configured(smtpUser) ? 'configured' : 'not_configured' },
    { key: 'whatsapp', label: 'WhatsApp', status: configured(waToken) ? 'configured' : 'not_configured' },
    { key: 'tekipost', label: 'TekiPost', status: configured(tekiEmail) ? 'configured' : 'not_configured' },
    { key: 'cloudinary', label: 'Cloudinary', status: configured(cloudName) ? 'configured' : 'not_integrated' },
  ];
}

const STATUS_ICON = {
  connected: '✅',
  configured: '✅',
  not_configured: '⚠️  Pending',
  not_integrated: 'ℹ️  Not Integrated',
  offline: '❌ Failed',
};

function fmt(status) {
  return STATUS_ICON[status] || status;
}

async function printHealthReport() {
  const statuses = await getIntegrationStatuses();
  const rows = [
    ['Deployment Environment', NODE_ENV],
    ['Backend API', `OK — ${urls.serverUrl}`],
    ['Frontend', urls.clientUrl],
    ['Admin Panel', urls.adminUrl],
    ...statuses.map((s) => [s.label, fmt(s.status) === s.status ? s.status : fmt(s.status)]),
  ];

  const width = Math.max(...rows.map(([label]) => label.length)) + 2;
  console.log('\n──────────────── Deployment Configuration Health Report ────────────────');
  rows.forEach(([label, value]) => {
    console.log(`${label.padEnd(width)} ${value}`);
  });
  console.log('──────────────────────────────────────────────────────────────────────\n');
}

module.exports = { getIntegrationStatuses, printHealthReport };
