const nodemailer     = require('nodemailer');
const settings       = require('./settingsService');
const NotificationLog = require('../models/NotificationLog');
const { company: companyConfig } = require('../config');

async function _buildTransporter() {
  const emailUser    = await settings.get('emailSmtpUser',     process.env.EMAIL_USER);
  const emailPass    = await settings.get('emailSmtpPassword', process.env.EMAIL_PASS);
  const smtpHost     = await settings.get('emailSmtpHost');
  const smtpPort     = await settings.get('emailSmtpPort',     587);
  const senderName   = await settings.get('emailSenderName',   companyConfig.name);

  if (!emailUser || !emailPass) return null;

  const port   = Number(smtpPort);
  const secure = port === 465;
  const config = smtpHost
    ? { host: smtpHost, port, secure, auth: { user: emailUser, pass: emailPass } }
    : { service: 'gmail', auth: { user: emailUser, pass: emailPass } };

  return { transport: nodemailer.createTransport(config), emailUser, senderName };
}

/**
 * meta: { event, templateName, recipientId, recipientName, _noInternalLog }
 */
const sendEmail = async (to, subject, html, meta = {}) => {
  const built = await _buildTransporter();
  if (!built) { console.warn('Email not configured — skipping'); return; }
  const { transport, emailUser, senderName } = built;

  let logEntry = null;
  if (!meta._noInternalLog) {
    logEntry = await NotificationLog.create({
      type:           'email',
      event:          meta.event || 'system',
      templateName:   meta.templateName || '',
      recipientEmail: to,
      recipientId:    meta.recipientId || null,
      recipientName:  meta.recipientName || '',
      subject,
      status:         'processing',
    }).catch(() => null);
  }

  try {
    await transport.sendMail({ from: `"${senderName}" <${emailUser}>`, to, subject, html });
    console.log(`Email sent to ${to}: ${subject}`);
    if (logEntry) { logEntry.status = 'delivered'; logEntry.response = { message: 'Sent' }; await logEntry.save().catch(() => {}); }
  } catch (err) {
    console.error(`Email error to ${to}:`, err.message);
    if (logEntry) { logEntry.status = 'failed'; logEntry.error = err.message; await logEntry.save().catch(() => {}); }
  }
};

const sendTestConnectionEmail = async (to) => {
  return sendEmail(to, 'Zutsav SMTP Test', `
    <div style="font-family:sans-serif;padding:24px">
      <h2 style="color:#b91c1c">&#9989; SMTP Connection Successful</h2>
      <p>Your email configuration is working correctly.</p>
      <p style="color:#6b7280;font-size:13px">Sent from Zutsav admin panel.</p>
    </div>`);
};

module.exports = {
  sendEmail,
  sendTestConnectionEmail,
};
