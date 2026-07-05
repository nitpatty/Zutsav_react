/**
 * Notification Dispatcher
 * Core routing layer of the Notification Engine.
 *
 * For a given event + payload:
 *  1. Fetch all enabled NotificationMapping records from DB
 *  2. For each mapping, resolve the recipient's contact details from the payload
 *  3. Dispatch to the appropriate channel (WhatsApp / Email / In-App)
 *  4. Errors in one channel never block others
 */

const NotificationMapping = require('../src/models/NotificationMapping');
const WhatsAppChannel     = require('./channels/WhatsAppChannel');
const EmailChannel        = require('./channels/EmailChannel');
const InAppChannel        = require('./channels/InAppChannel');

/**
 * Resolve the recipient's phone and email from the payload based on recipientType.
 */
function resolveContact(recipientType, payload) {
  const src = payload[recipientType] || {};
  return {
    phone: src.phone || '',
    email: src.email || '',
  };
}

/**
 * Dispatch all configured notifications for an event.
 *
 * @param {string} eventName  - One of the EVENTS constants from EventRegistry
 * @param {Object} payload    - Standardized payload carrying all event context
 * @returns {Promise<void>}
 */
async function dispatch(eventName, payload) {
  let mappings;
  try {
    mappings = await NotificationMapping.find({ eventName, enabled: true })
      .sort({ priority: -1 })
      .lean();
  } catch (err) {
    console.error(`[Dispatcher] DB fetch failed for event "${eventName}":`, err.message);
    return;
  }

  if (!mappings || mappings.length === 0) {
    // No mappings configured — silently skip (admin has not set up this event yet)
    return;
  }

  // Stamp the event name into payload so channels can reference it
  const enrichedPayload = { ...payload, _eventName: eventName };

  await Promise.all(
    mappings.map((mapping) => _dispatchOne(mapping, enrichedPayload))
  );
}

async function _dispatchOne(mapping, payload) {
  const channel       = mapping.channel;
  const recipientType = mapping.recipientType;

  try {
    if (channel === 'inapp') {
      await InAppChannel.send(mapping, payload);
      return;
    }

    // WhatsApp and Email need a contact address
    const { phone, email } = resolveContact(recipientType, payload);

    if (channel === 'whatsapp') {
      await WhatsAppChannel.send(mapping, payload, phone);
    } else if (channel === 'email') {
      await EmailChannel.send(mapping, payload, email);
    } else {
      console.warn(`[Dispatcher] Unknown channel "${channel}" on mapping ${mapping._id}`);
    }
  } catch (err) {
    // Log but never propagate — one failing channel must not block others
    console.error(
      `[Dispatcher] Channel "${channel}" failed for event "${payload._eventName}" (mapping ${mapping._id}):`,
      err.message
    );
  }
}

module.exports = { dispatch };
