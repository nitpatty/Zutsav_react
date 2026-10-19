const Notification = require('../models/Notification');

let _io = null;

const setIO = (io) => { _io = io; };

/**
 * Create a notification and emit it via Socket.IO to the target user.
 */
const createNotification = async ({ userId, type, title, message, data = {} }) => {
  try {
    const notification = await Notification.create({ userId, type, title, message, data });
    if (_io) {
      _io.to(`user_${userId.toString()}`).emit('new_notification', {
        _id:       notification._id,
        type:      notification.type,
        title:     notification.title,
        message:   notification.message,
        data:      notification.data,
        isRead:    false,
        createdAt: notification.createdAt,
      });
    }
    return notification;
  } catch (err) {
    console.error('[Notification] create error:', err.message);
  }
};

/**
 * Emit an arbitrary realtime event to a single user's room. Used for
 * lightweight, targeted cache-invalidation signals (e.g. the Pandit
 * availability calendar) that are not user-facing notifications and therefore
 * must not be persisted or shown in the notification bell.
 *
 * Returns true when a Socket.IO server is attached and the emit happened.
 */
const emitToUser = (userId, event, payload = {}) => {
  if (!_io || !userId) return false;
  _io.to(`user_${userId.toString()}`).emit(event, payload);
  return true;
};

module.exports = {
  setIO,
  createNotification,
  emitToUser,
};
