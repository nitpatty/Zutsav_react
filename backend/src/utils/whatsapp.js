const axios           = require('axios');
const settings        = require('./settingsService');
const WhatsAppTemplate = require('../models/WhatsAppTemplate');

async function _cfg() {
  const phoneNumberId = await settings.get('whatsappPhoneNumberId', process.env.WHATSAPP_PHONE_NUMBER_ID);
  const accessToken   = await settings.get('whatsappAccessToken',   process.env.WHATSAPP_ACCESS_TOKEN);
  const apiVersion    = await settings.get('whatsappApiVersion',    process.env.WHATSAPP_API_VERSION || 'v18.0');
  return { phoneNumberId, accessToken, apiVersion };
}

/**
 * Normalize phone to E.164 digits (no leading +).
 * Handles: 10-digit, 12-digit with 91, +91 prefix, or already correct.
 */
function normalizePhone(to) {
  const digits = String(to).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits;  // 919876543210
  if (digits.length === 10) return `91${digits}`;                       // 9876543210
  return digits;                                                        // other formats
}

/**
 * Send an approved WhatsApp template message.
 * Throws on Meta API error so callers can log the failure properly.
 * Returns null (without throwing) only when WhatsApp is not configured.
 */
const sendWhatsApp = async (to, templateName, components = [], languageCode = 'en') => {
  const { phoneNumberId, accessToken, apiVersion } = await _cfg();
  if (!accessToken || !phoneNumberId) {
    console.warn('[WhatsApp] Not configured — skipping send for template:', templateName);
    return null;
  }

  const phone = normalizePhone(to);
  const url   = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  const res = await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to:                phone,
      type:              'template',
      template:          { name: templateName, language: { code: languageCode }, components },
    },
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
  );

  // Meta returns HTTP 200 even for some soft errors — check for error object in body
  if (res.data?.error) {
    const metaErr = res.data.error;
    throw new Error(`Meta API error ${metaErr.code}: ${metaErr.message || JSON.stringify(metaErr)}`);
  }

  console.log(`[WhatsApp] Sent template "${templateName}" to ${phone} — msgId: ${res.data?.messages?.[0]?.id}`);
  return res.data;
};

// ── Approved template helpers ─────────────────────────────────
// These are fire-and-forget: they NEVER throw so the main request never crashes.
// Errors are logged to console; check NotificationLog (via loggedSendWhatsApp) for audit trail.

const _safe = async (label, fn) => {
  try { return await fn(); }
  catch (err) { console.error(`[WhatsApp] ${label} failed:`, err.message); return null; }
};

/**
 * Registration / login OTP
 * Template: whatsapp_verification (AUTHENTICATION, lang=en_US)
 * Body {{1}} = OTP code
 */
const sendOtpWhatsApp = (phone, otp) => _safe('sendOtpWhatsApp', () =>
  sendWhatsApp(phone, 'whatsapp_verification', [
    { type: 'body', parameters: [{ type: 'text', text: String(otp) }] },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: String(otp) }] },
  ], 'en_US')
);

/**
 * Booking confirmation after payment
 * Template: payment_success (UTILITY, lang=en)
 * Body {{1}}=customerName, {{2}}=amount, {{3}}=bookingNumber
 */
const notifyBookingConfirmed = (booking, poojaName) => _safe('notifyBookingConfirmed', () =>
  sendWhatsApp(booking.userDetails.phone, 'payment_success', [
    { type: 'body', parameters: [
      { type: 'text', text: booking.userDetails.name },
      { type: 'text', text: String(booking.amount) },
      { type: 'text', text: booking.bookingNumber },
    ]},
  ], 'en')
);

/**
 * Pandit assigned — notify USER
 * Template: puja_assigned (UTILITY, lang=en)
 * Body {{1}}=customerName, {{2}}=panditName, {{3}}=panditContact, {{4}}=poojaName
 */
const notifyPanditAssigned = (booking, pandit) => _safe('notifyPanditAssigned', () =>
  sendWhatsApp(booking.userDetails.phone, 'puja_assigned', [
    { type: 'body', parameters: [
      { type: 'text', text: booking.userDetails.name },
      { type: 'text', text: pandit.name },
      { type: 'text', text: pandit.phone || 'Contact via app' },
      { type: 'text', text: booking.poojaId?.name || 'Pooja' },
    ]},
  ], 'en')
);

/**
 * New booking assigned — notify PANDIT
 * Template: pandit_puja_assigned (UTILITY, lang=en)
 * Body {{1}}=panditName, {{2}}=poojaName, {{3}}=date, {{4}}=time, {{5}}=address
 */
const notifyPanditOfNewBooking = (booking, pandit, poojaName) => _safe('notifyPanditOfNewBooking', () => {
  if (!pandit.phone) return null;
  const date = new Date(booking.scheduledDate).toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  return sendWhatsApp(pandit.phone, 'pandit_puja_assigned', [
    { type: 'body', parameters: [
      { type: 'text', text: pandit.name },
      { type: 'text', text: poojaName },
      { type: 'text', text: date },
      { type: 'text', text: booking.scheduledTime || 'As scheduled' },
      { type: 'text', text: booking.userDetails.address || booking.userDetails.city || 'As per booking' },
    ]},
  ], 'en');
});

/**
 * Completion OTP — sent to user when pandit marks service done
 * puja_comfirmation_verification_code is REJECTED in Meta — using whatsapp_verification as fallback
 * Template: whatsapp_verification (AUTHENTICATION, lang=en_US)
 * Body {{1}} = OTP code
 */
const sendCompletionOtpWhatsApp = (booking, poojaName, otp) => _safe('sendCompletionOtpWhatsApp', () =>
  sendWhatsApp(booking.userDetails.phone, 'whatsapp_verification', [
    { type: 'body', parameters: [{ type: 'text', text: String(otp) }] },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: String(otp) }] },
  ], 'en_US')
);

// KYC / Payment templates — no matching approved templates in Meta yet; fail silently
const sendKycApprovedWhatsApp    = (phone, panditName)         => _safe('sendKycApprovedWhatsApp',    () => null);
const sendKycRejectedWhatsApp    = (phone, panditName, reason) => _safe('sendKycRejectedWhatsApp',    () => null);
const sendPaymentReleasedWhatsApp = (phone, panditName, amount, batchId) => _safe('sendPaymentReleasedWhatsApp', () => null);

/**
 * Freeform text is NOT supported on WhatsApp Business API for business-initiated messages.
 * This stub exists so legacy imports don't crash — it always throws.
 */
const sendWhatsAppText = async () => {
  throw new Error('Freeform text messages are not supported on WhatsApp Business API. Use an approved template.');
};

/**
 * Look up the enabled, approved template mapped to a given event name.
 * Returns null (with a console warning) if nothing is configured — callers must handle null gracefully.
 */
const getTemplateForEvent = async (eventName) => {
  try {
    const tmpl = await WhatsAppTemplate.findOne({
      assignedTrigger: eventName,
      isActive:        true,
      status:          'APPROVED',
    }).lean();
    if (!tmpl) {
      console.warn(`[WhatsApp] No active template mapped for event "${eventName}" — notification skipped.`);
    }
    return tmpl || null;
  } catch (err) {
    console.warn(`[WhatsApp] getTemplateForEvent("${eventName}") DB error:`, err.message);
    return null;
  }
};

/**
 * Send a WhatsApp message for a named platform event.
 * Looks up the active template from the database — no hardcoded template names.
 * Returns null if no template is configured (does not throw).
 */
const sendWhatsAppForEvent = async (eventName, phone, components = []) => {
  const tmpl = await getTemplateForEvent(eventName);
  if (!tmpl) return null;
  return sendWhatsApp(phone, tmpl.name, components, tmpl.language || 'en');
};

module.exports = {
  sendWhatsApp,
  sendWhatsAppText,
  getTemplateForEvent,
  sendWhatsAppForEvent,
  sendOtpWhatsApp,
  notifyBookingConfirmed,
  notifyPanditAssigned,
  notifyPanditOfNewBooking,
  sendCompletionOtpWhatsApp,
  sendKycApprovedWhatsApp,
  sendKycRejectedWhatsApp,
  sendPaymentReleasedWhatsApp,
};
