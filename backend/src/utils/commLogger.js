const NotificationLog = require('../models/NotificationLog');
const { sendEmail }      = require('./email');
const { sendWhatsApp, sendWhatsAppText } = require('./whatsapp');

/**
 * Send an email and record the result in NotificationLog.
 */
const loggedSendEmail = async ({ to, subject, html, event = 'manual', templateName = '', recipientId = null, recipientName = '' }) => {
  const log = await NotificationLog.create({
    type: 'email',
    event,
    templateName,
    recipientEmail: to,
    recipientId,
    recipientName,
    subject,
    status: 'processing',
  });

  try {
    await sendEmail(to, subject, html, { _noInternalLog: true });
    log.status   = 'delivered';
    log.response = { message: 'Sent via nodemailer' };
  } catch (err) {
    log.status = 'failed';
    log.error  = err.message;
  }

  await log.save();
  return log;
};

/**
 * Send a WhatsApp template message and record the result.
 * languageCode should be passed from the DB template record.
 * Returns null without throwing when WhatsApp is not configured.
 * Throws (and marks log as failed) on Meta API errors.
 */
const loggedSendWhatsApp = async ({ to, templateName, languageCode = 'en', components = [], event = 'manual', recipientId = null, recipientName = '' }) => {
  const log = await NotificationLog.create({
    type: 'whatsapp',
    event,
    templateName,
    recipientPhone: to,
    recipientId,
    recipientName,
    status: 'processing',
  });

  try {
    const res = await sendWhatsApp(to, templateName, components, languageCode, { _noInternalLog: true });

    if (res === null) {
      // sendWhatsApp returns null only when WhatsApp is not configured — treat as skipped
      log.status = 'failed';
      log.error  = 'WhatsApp not configured (WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID missing)';
    } else {
      log.status   = 'delivered';
      log.response = res;
    }
  } catch (err) {
    // Meta API error — e.g. template not found, invalid phone, expired token
    log.status = 'failed';
    log.error  = err.message;
    if (err.meta) log.metadata = { ...log.metadata, metaError: err.meta };
    console.error('[WhatsApp] send failed:', err.message, err.meta || '');
  }

  await log.save();
  return log;
};

/**
 * Send a WhatsApp text (freeform) and record the result.
 */
const loggedSendWhatsAppText = async ({ to, text, event = 'manual', recipientId = null, recipientName = '' }) => {
  const log = await NotificationLog.create({
    type: 'whatsapp',
    event,
    templateName: 'freeform',
    recipientPhone: to,
    recipientId,
    recipientName,
    status: 'processing',
  });

  try {
    const res  = await sendWhatsAppText(to, text);
    log.status   = 'delivered';
    log.response = res || {};
  } catch (err) {
    log.status = 'failed';
    log.error  = err.message;
  }

  await log.save();
  return log;
};

module.exports = { loggedSendEmail, loggedSendWhatsApp, loggedSendWhatsAppText };
