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

module.exports = {
  setIO,
  createNotification,
};
