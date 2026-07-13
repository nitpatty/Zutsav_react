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
 *
 * v2: emit() now calls core/EventDispatcher (enqueue → queue/Worker → channel
 * plugins), not the old synchronous Dispatcher.js. `payload` must be a
 * normalized payload (see variables/PayloadNormalizer.js) — callers that
 * still build the old ad hoc shape will have their recipient resolution
 * silently return no matches (logged, not thrown) until migrated.
 */

const EventDispatcher = require('./core/EventDispatcher');
const { EVENTS }   = require('./EventRegistry');

const NotificationEngine = {
  /**
   * Emit a notification event.
   *
   * @param {string} eventName  - One of EVENTS constants (e.g. 'PAYMENT_SUCCESS')
   * @param {Object} payload    - normalized payload (see PayloadNormalizer.js)
   * @param {Object} [options]
   * @param {string} [options.channel] - restrict dispatch to a single channel
   * @returns {Promise<void>}   - Always resolves, never rejects
   */
  async emit(eventName, payload = {}, options = {}) {
    if (!eventName) {
      console.warn('[NotificationEngine] emit() called without eventName');
      return;
    }
    if (!EVENTS[eventName]) {
      console.warn(`[NotificationEngine] Unknown event "${eventName}" — add it to EventRegistry.js`);
    }
    try {
      await EventDispatcher.dispatch(eventName, payload, options);
    } catch (err) {
      console.error(`[NotificationEngine] Unhandled error for event "${eventName}":`, err.message);
    }
  },
};

module.exports = NotificationEngine;
