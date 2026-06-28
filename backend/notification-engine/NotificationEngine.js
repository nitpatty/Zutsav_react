/**
 * Notification Engine
 * The single public interface that all business modules use.
 *
 * Usage (fire-and-forget):
 *   const { NotificationEngine } = require('../../notification-engine');
 *   NotificationEngine.emit('PAYMENT_SUCCESS', payload).catch(() => {});
 *
 * Design principles:
 *  - Controllers only call emit() — they know nothing about channels or templates
 *  - The engine reads all configuration from the DB (NotificationMapping collection)
 *  - Admin controls everything: channels, templates, recipients, on/off
 *  - The engine never throws to its callers; errors are logged internally
 */

const { dispatch } = require('./Dispatcher');
const { EVENTS }   = require('./EventRegistry');

const NotificationEngine = {
  /**
   * Emit a notification event.
   *
   * @param {string} eventName  - One of EVENTS constants (e.g. 'PAYMENT_SUCCESS')
   * @param {Object} payload    - Event-specific data object
   * @returns {Promise<void>}   - Always resolves, never rejects
   */
  async emit(eventName, payload = {}) {
    if (!eventName) {
      console.warn('[NotificationEngine] emit() called without eventName');
      return;
    }
    if (!EVENTS[eventName]) {
      console.warn(`[NotificationEngine] Unknown event "${eventName}" — add it to EventRegistry.js`);
    }
    try {
      await dispatch(eventName, payload);
    } catch (err) {
      console.error(`[NotificationEngine] Unhandled error for event "${eventName}":`, err.message);
    }
  },
};

module.exports = NotificationEngine;
