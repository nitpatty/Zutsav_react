/**
 * Notification Logger — the ONE writer to NotificationLog.
 *
 * Replaces the three independent writers that existed before this rebuild
 * (email.js, whatsapp.js, and the old comm-center logger each wrote their
 * own rows, risking duplicate/inconsistent log entries for the same send).
 * Every status transition (queued/processing/delivered/failed/retrying/
 * dead_letter/skipped/cancelled) goes through this single function.
 */

const NotificationLog = require('../../src/models/NotificationLog');

async function log({
  jobId, type, event, templateName,
  recipientEmail, recipientPhone, recipientId, recipientName, subject,
  status, payload, variables, renderedContent, response, error, retryCount, metadata,
}) {
  try {
    return await NotificationLog.create({
      jobId, type, event, templateName,
      recipientEmail: recipientEmail || '',
      recipientPhone: recipientPhone || '',
      recipientId:    recipientId || null,
      recipientName:  recipientName || '',
      subject:        subject || '',
      status,
      payload:         payload ?? null,
      variables:       variables ?? null,
      renderedContent: renderedContent ?? null,
      response:        response ?? null,
      error:           error || '',
      retryCount:      retryCount || 0,
      metadata:        metadata || {},
    });
  } catch (err) {
    // Logging must never throw and break the actual notification flow.
    console.error('[NotificationLogger] failed to write log:', err.message);
    return null;
  }
}

module.exports = { log };
