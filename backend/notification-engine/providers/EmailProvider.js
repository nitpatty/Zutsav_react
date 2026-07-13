/**
 * Email Provider — pure SMTP send primitive (nodemailer), extracted from
 * the transport-building logic in src/utils/email.js. No internal logging —
 * that responsibility belongs solely to the Worker/NotificationLogger now,
 * so a send is never logged twice.
 */

const nodemailer = require('nodemailer');
const settings = require('../../src/utils/settingsService');
const { company: companyConfig, urls: urlsConfig } = require('../../src/config');

async function companyInfo() {
  const [name, email, phone, gstin, pan, websiteUrl] = await Promise.all([
    settings.get('platformName', companyConfig.name),
    settings.get('contactEmail', companyConfig.supportEmail),
    settings.get('supportPhone', companyConfig.supportPhone),
    settings.get('companyGstin', companyConfig.gstin),
    settings.get('companyPan', companyConfig.pan),
    settings.get('deployWebsiteUrl', urlsConfig.clientUrl),
  ]);
  return { name, email, phone, gstin, pan, websiteUrl: String(websiteUrl || '').replace(/\/$/, '') };
}

async function buildTransporter() {
  const emailUser  = await settings.get('emailSmtpUser', process.env.EMAIL_USER);
  const emailPass  = await settings.get('emailSmtpPassword', process.env.EMAIL_PASS);
  const smtpHost   = await settings.get('emailSmtpHost');
  const smtpPort   = await settings.get('emailSmtpPort', 587);
  const senderName = await settings.get('emailSenderName', companyConfig.name);

  if (!emailUser || !emailPass) return null;

  const port = Number(smtpPort);
  const secure = port === 465;
  const config = smtpHost
    ? { host: smtpHost, port, secure, auth: { user: emailUser, pass: emailPass } }
    : { service: 'gmail', auth: { user: emailUser, pass: emailPass } };

  return { transport: nodemailer.createTransport(config), emailUser, senderName };
}

/**
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.subject
 * @param {string} opts.html
 * @returns {Promise<object>} provider response (for logging)
 * @throws if not configured or the send itself fails — callers (the Worker)
 *   treat a throw as a retryable failure, which is correct: an admin fixing
 *   SMTP credentials mid-retry-window should let queued jobs self-heal.
 */
async function send({ to, subject, html }) {
  const built = await buildTransporter();
  if (!built) {
    throw new Error('Email not configured (missing SMTP credentials)');
  }
  const { transport, emailUser, senderName } = built;
  await transport.sendMail({ from: `"${senderName}" <${emailUser}>`, to, subject, html });
  return { message: 'Sent', to, subject };
}

module.exports = { send, companyInfo };
