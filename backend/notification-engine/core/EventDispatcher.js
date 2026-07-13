/**
 * Event Dispatcher (v2)
 *
 * For a given event + normalized payload: look up enabled mappings (cached),
 * resolve each mapping's recipient(s), and enqueue one durable
 * NotificationJob per (mapping × recipient) — no synchronous sending here.
 * Actual delivery happens later, off the request path, via queue/Worker.js.
 *
 * Recipient resolution mirrors the current live InAppChannel's logic
 * (same recipientType semantics: user/pandit/referral_pandit/admin) so
 * behavior is preserved when this becomes the live path in Phase 3.
 */

const User = require('../../src/models/User');
const MappingCache = require('./MappingCache');
const JobQueue = require('../queue/JobQueue');

/**
 * A recipient is usable as long as SOME contact route exists — a userId
 * (needed only by the in-app channel), a phone (WhatsApp), or an email.
 * Pre-registration OTP is the reason this can't require userId: there is no
 * User document yet, only a name/phone/email the caller is trying to verify.
 */
function hasAnyContact(entity) {
  return !!(entity?.userId || entity?.phone || entity?.email);
}

// NotificationJob.recipient.userId is a Mongoose ObjectId field — passing ''
// (rather than omitting the key or passing null) fails BSON casting. Pre-
// registration OTP and other no-account-yet flows legitimately have no
// userId, only phone/email, so this must normalize to null, not ''.
function orNull(id) {
  return id || null;
}

async function resolveRecipients(recipientType, payload) {
  switch (recipientType) {
    case 'user':
      return hasAnyContact(payload.customer)
        ? [{ userId: orNull(payload.customer.userId), phone: payload.customer.phone, email: payload.customer.email }]
        : [];

    case 'pandit':
      return hasAnyContact(payload.pandit)
        ? [{ userId: orNull(payload.pandit.userId), phone: payload.pandit.phone, email: payload.pandit.email }]
        : [];

    case 'referral_pandit':
      // Referral events carry the referred pandit under `pandit` too (normalized by the caller)
      return hasAnyContact(payload.pandit)
        ? [{ userId: orNull(payload.pandit.userId), phone: payload.pandit.phone, email: payload.pandit.email }]
        : [];

    case 'admin': {
      const admins = await User.find({ role: 'admin' }).select('_id email phone').lean();
      return admins.map((a) => ({ userId: String(a._id), phone: a.phone || '', email: a.email || '' }));
    }

    default:
      return [];
  }
}

/**
 * @param {string} eventName
 * @param {object} normalizedPayload  - output of PayloadNormalizer
 * @param {object} [options]
 * @param {string} [options.channel]  - restrict dispatch to a single channel
 *   (e.g. 'email' or 'whatsapp'). Needed where the user explicitly chose a
 *   delivery channel — OTP send is the case that matters: a user picking
 *   "email" must not also receive a WhatsApp message just because a
 *   whatsapp mapping happens to be enabled for the same event.
 * @returns {Promise<{ enqueued: number }>}
 */
async function dispatch(eventName, normalizedPayload, options = {}) {
  let mappings;
  try {
    mappings = await MappingCache.getEnabledMappings(eventName);
  } catch (err) {
    console.error(`[EventDispatcher] mapping lookup failed for "${eventName}":`, err.message);
    return { enqueued: 0 };
  }

  if (options.channel) {
    mappings = (mappings || []).filter((m) => m.channel === options.channel);
  }

  if (!mappings || mappings.length === 0) return { enqueued: 0 };

  let enqueued = 0;
  for (const mapping of mappings) {
    let recipients;
    try {
      recipients = await resolveRecipients(mapping.recipientType, normalizedPayload);
    } catch (err) {
      console.error(`[EventDispatcher] recipient resolution failed (mapping ${mapping._id}):`, err.message);
      continue;
    }

    for (const recipient of recipients) {
      try {
        await JobQueue.enqueue({
          eventName,
          mappingId: mapping._id,
          channel: mapping.channel,
          recipient,
          normalizedPayload,
        });
        enqueued++;
      } catch (err) {
        console.error(`[EventDispatcher] enqueue failed (mapping ${mapping._id}):`, err.message);
      }
    }
  }

  return { enqueued };
}

module.exports = { dispatch, resolveRecipients };
