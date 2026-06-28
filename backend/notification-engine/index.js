/**
 * Notification Engine — public exports
 *
 * Only NotificationEngine and EVENTS are intended for use outside this module.
 * Import pattern:
 *   const { NotificationEngine, EVENTS } = require('../../notification-engine');
 */

const NotificationEngine = require('./NotificationEngine');
const { EVENTS, EVENT_CATEGORIES } = require('./EventRegistry');

module.exports = {
  NotificationEngine,
  EVENTS,
  EVENT_CATEGORIES,
};
