/**
 * In-App Channel (v2)
 *
 * Recipient resolution now happens upstream in EventDispatcher (one job per
 * resolved recipient), so this channel just renders + creates the
 * notification for the one recipient.userId it's given, via the existing
 * createNotification() (kept as-is — it already owns the real-time
 * Socket.IO `new_notification` emit, load-bearing for the in-app bell).
 */

const TemplateEngine = require('../templates/TemplateEngine');
const TemplateValidator = require('../templates/TemplateValidator');
const { createNotification } = require('../../src/utils/notificationService');

/**
 * @param {object} mapping   - NotificationMapping document
 * @param {object} payload   - normalized payload
 * @param {object} recipient - { userId, phone, email }
 */
async function send(mapping, payload, recipient) {
  const userId = recipient?.userId;
  if (!userId) return { skip: true, reason: 'No userId for recipient' };

  if (!mapping.inAppTitle) {
    return { skip: true, reason: 'Mapping has no in-app title configured' };
  }

  const eventName = payload._eventName || mapping.eventName || '';
  const rawText = TemplateEngine.rawTemplateText('inapp', mapping);
  const validation = TemplateValidator.validate(eventName, rawText, payload);
  if (!validation.valid) {
    return {
      skip: true,
      reason: `Missing required variable(s): ${validation.missing.join(', ')}`,
      templateName: mapping.inAppTitle || '',
      missing: validation.missing,
    };
  }

  const { type, title, message } = TemplateEngine.render('inapp', mapping, payload);

  const data = {};
  if (payload.booking?.number) data.bookingNumber = payload.booking.number;
  if (payload.order?.number)   data.orderNumber   = payload.order.number;

  const notification = await createNotification({
    userId,
    type: type || eventName.toLowerCase(),
    title,
    message,
    data,
  });

  return { response: { notificationId: notification?._id }, renderedContent: { title, message } };
}

module.exports = { send };
