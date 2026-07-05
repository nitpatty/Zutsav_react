const { readEnv } = require('./env');

// Values used in outbound emails/invoices. Previously hardcoded independently
// in `email.js` (3+ times) with an inconsistent support email elsewhere in
// the frontend — this is the one place backend code should read them from.
module.exports = {
  name: readEnv('COMPANY_NAME') || 'Zutsav Enterprises',
  logo: readEnv('COMPANY_LOGO') || '',
  supportEmail: readEnv('SUPPORT_EMAIL') || 'info@zutsav.com',
  supportPhone: readEnv('SUPPORT_PHONE') || '+91-8851576605',
  gstin: readEnv('COMPANY_GSTIN') || '09AAAFZ1234Z1Z5',
  pan: readEnv('COMPANY_PAN') || 'AAAFZ1234Z',
  privacyUrl: readEnv('PRIVACY_URL') || 'https://www.zutsav.com/privacy',
  termsUrl: readEnv('TERMS_URL') || 'https://www.zutsav.com/terms',
  currency: readEnv('DEFAULT_CURRENCY') || 'INR',
  timezone: readEnv('DEFAULT_TIMEZONE') || 'Asia/Kolkata',
};
