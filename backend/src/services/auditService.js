const { UAParser } = require('ua-parser-js');
const AdminAuditLog = require('../models/AdminAuditLog');

function extractRequestMeta(req) {
  const ipAddress = req.headers['x-forwarded-for']?.split(',')[0].trim()
    || req.socket?.remoteAddress || '';
  const userAgent = req.headers['user-agent'] || '';
  const { browser, os } = parseUserAgent(userAgent);
  return {
    ipAddress,
    userAgent,
    browser,
    os,
    requestId: req.requestId || '',
    sessionId: req.sid || '',
  };
}

function parseUserAgent(userAgent) {
  if (!userAgent) return { browser: '', os: '' };
  try {
    const parsed = new UAParser(userAgent).getResult();
    const browser = [parsed.browser?.name, parsed.browser?.version].filter(Boolean).join(' ');
    const os = [parsed.os?.name, parsed.os?.version].filter(Boolean).join(' ');
    return { browser, os };
  } catch {
    return { browser: '', os: '' };
  }
}

/**
 * audit(req, {...}) — the ONE function every controller calls to record an
 * admin-tier action. Fire-and-forget: never throws, never awaited in the
 * request path (mirrors NotificationEngine.emit's convention). Callers
 * should never construct AdminAuditLog documents directly.
 */
async function audit(req, {
  module: moduleName, action, targetType = '', targetId = null, targetName = '',
  targetEmail = '', targetPhone = '',
  oldValues = null, newValues = null, note = '', severity = 'info', status = 'success',
}) {
  try {
    const meta = extractRequestMeta(req);
    await AdminAuditLog.create({
      action,
      module: moduleName,
      note,
      severity,
      status,
      performedBy: req.user?._id || null,
      performedByName: req.user?.name || 'System',
      performedByRole: req.user?.role || '',
      targetId,
      targetType,
      targetName,
      targetEmail,
      targetPhone,
      oldValues,
      newValues,
      ...meta,
    });
  } catch (err) {
    console.error('[AuditService] write failed:', err.message);
  }
}

module.exports = { audit, extractRequestMeta, parseUserAgent };
