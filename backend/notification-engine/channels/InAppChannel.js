/**
 * In-App Notification Channel
 * Creates in-app notifications via Socket.IO for the target user(s).
 *
 * Recipient resolution:
 *  - user   → payload.user.id   (User._id)
 *  - pandit → payload.pandit.userId  (User._id of pandit's user account)
 *  - admin  → queries DB for all admin User._ids
 *
 * Title and message support {{variable}} interpolation against the payload.
 */

const { interpolate } = require('../VariableResolver');
const { createNotification } = require('../../src/utils/notificationService');
const User = require('../../src/models/User');

/**
 * Resolve the User._id(s) to notify based on recipientType.
 * Returns an array of User._id strings.
 */
async function resolveRecipientIds(recipientType, payload) {
  switch (recipientType) {
    case 'user':
      return payload.user?.id ? [payload.user.id] : [];

    case 'pandit':
      // pandit.userId is the User._id (pandit.id is the Pandit._id)
      return payload.pandit?.userId ? [payload.pandit.userId] : [];

    case 'referral_pandit':
      return payload.referralPandit?.userId ? [payload.referralPandit.userId] : [];

    case 'admin': {
      // Look up all active admin users — lightweight query, result cached hot by MongoDB
      const admins = await User.find({ role: 'admin' }).select('_id').lean();
      return admins.map((a) => String(a._id));
    }

    default:
      return [];
  }
}

/**
 * @param {Object} mapping  - NotificationMapping document
 * @param {Object} payload  - Normalized event payload
 * @returns {Promise<void>}
 */
async function send(mapping, payload) {
  if (!mapping.inAppTitle) {
    console.warn('[InApp Channel] No inAppTitle on mapping:', mapping._id);
    return;
  }

  const userIds = await resolveRecipientIds(mapping.recipientType, payload);
  if (userIds.length === 0) return;

  const title   = interpolate(mapping.inAppTitle,   payload);
  const message = interpolate(mapping.inAppMessage || '', payload);
  const type    = mapping.inAppType || (payload._eventName || 'notification').toLowerCase();

  // Build optional data object from payload references
  const data = {};
  if (payload.booking?.bookingNumber) data.bookingNumber = payload.booking.bookingNumber;
  if (payload.order?.orderNumber)     data.orderNumber   = payload.order.orderNumber;
  if (payload.referral?.referralId)   data.referralId    = payload.referral.referralId;

  await Promise.all(
    userIds.map((userId) =>
      createNotification({ userId, type, title, message, data }).catch((err) =>
        console.error('[InApp Channel] createNotification failed:', err.message)
      )
    )
  );
}

module.exports = { send };
