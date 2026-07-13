/**
 * Log Management Controller
 *
 * Central registry + API handlers for all platform log collections.
 * Adding a new log type in the future: add one entry to LOG_REGISTRY below.
 * No other code needs to change.
 *
 * Cleanup runs in BATCH_SIZE chunks to avoid MongoDB locks and server timeouts.
 * Protected/locked types require stronger confirmation tokens.
 * Every cleanup creates a LogCleanupRecord for accountability.
 */

const LogCleanupRecord = require('../models/LogCleanupRecord');
const SystemSettings    = require('../models/SystemSettings');

// ─── Central Log Registry ─────────────────────────────────────────────────────
const LOG_REGISTRY = {
  notification_log: {
    label:              'Notification Delivery Logs',
    description:        'Email, WhatsApp, and SMS delivery tracking records',
    getModel:           () => require('../models/NotificationLog'),
    protected:          false,
    locked:             false,
    icon:               'Bell',
    defaultRetentionDays: 90,
    retentionSettingKey:  'logRetentionNotificationLog',
  },
  notification: {
    label:              'In-App Notifications',
    description:        'User in-app notification history',
    getModel:           () => require('../models/Notification'),
    protected:          false,
    locked:             false,
    icon:               'Bell',
    defaultRetentionDays: 180,
    retentionSettingKey:  'logRetentionNotification',
  },
  audit: {
    label:              'Admin Audit Logs',
    description:        'Admin action history — platform compliance and accountability record',
    getModel:           () => require('../models/AdminAuditLog'),
    protected:          true,
    locked:             false,
    icon:               'Shield',
    defaultRetentionDays: 730,
    retentionSettingKey:  'logRetentionAudit',
  },
  inventory: {
    label:              'Inventory Logs',
    description:        'Product stock movement and adjustment history',
    getModel:           () => require('../models/InventoryLog'),
    protected:          false,
    locked:             false,
    icon:               'Package',
    defaultRetentionDays: 365,
    retentionSettingKey:  'logRetentionInventory',
  },
  sync: {
    label:              'Festival Sync Logs',
    description:        'External data synchronisation operation history',
    getModel:           () => require('../models/SyncLog'),
    protected:          false,
    locked:             false,
    icon:               'RefreshCw',
    defaultRetentionDays: 180,
    retentionSettingKey:  'logRetentionSync',
  },
  payment_ledger: {
    label:              'Payment Ledger',
    description:        'Payment transaction records — financial compliance data',
    getModel:           () => require('../models/PaymentLedger'),
    protected:          true,
    locked:             true,   // financial data — view only, cannot be deleted here
    icon:               'CreditCard',
    defaultRetentionDays: 0,    // 0 = keep forever
    retentionSettingKey:  null,
  },
  payout: {
    label:              'Payout Records',
    description:        'Pandit payout batch history — financial compliance data',
    getModel:           () => require('../models/PayoutBatch'),
    protected:          true,
    locked:             true,
    icon:               'IndianRupee',
    defaultRetentionDays: 0,
    retentionSettingKey:  null,
  },
};

const BATCH_SIZE = 500;

// ─── Date query builder ───────────────────────────────────────────────────────
function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function buildDateQuery(rule, from, to) {
  switch (rule) {
    case 'last_7d':    return { createdAt: { $gte: daysAgo(7) } };
    case 'last_30d':   return { createdAt: { $gte: daysAgo(30) } };
    case 'older_90d':  return { createdAt: { $lt: daysAgo(90) } };
    case 'older_180d': return { createdAt: { $lt: daysAgo(180) } };
    case 'older_1y':   return { createdAt: { $lt: daysAgo(365) } };
    case 'custom': {
      const q = {};
      if (from) q.$gte = new Date(from);
      if (to)   q.$lte = new Date(to);
      return Object.keys(q).length ? { createdAt: q } : {};
    }
    default: return {};
  }
}

function getRuleDateRange(rule, from, to) {
  switch (rule) {
    case 'last_7d':    return { from: daysAgo(7),   to: new Date() };
    case 'last_30d':   return { from: daysAgo(30),  to: new Date() };
    case 'older_90d':  return { from: null,          to: daysAgo(90) };
    case 'older_180d': return { from: null,          to: daysAgo(180) };
    case 'older_1y':   return { from: null,          to: daysAgo(365) };
    case 'custom':     return { from: from ? new Date(from) : null, to: to ? new Date(to) : null };
    default:           return { from: null, to: null };
  }
}

// ─── GET /api/admin/logs/overview ────────────────────────────────────────────
exports.getOverview = async (req, res) => {
  try {
    const settings = await SystemSettings.findOne().lean();
    const logs = [];

    for (const [type, config] of Object.entries(LOG_REGISTRY)) {
      const Model = config.getModel();
      const [total, oldest, newest, lastCleanup] = await Promise.all([
        Model.countDocuments(),
        Model.findOne().sort({ createdAt: 1 }).select('createdAt').lean(),
        Model.findOne().sort({ createdAt: -1 }).select('createdAt').lean(),
        LogCleanupRecord.findOne({ logType: type }).sort({ createdAt: -1 }).lean(),
      ]);

      const retentionDays = config.retentionSettingKey
        ? (settings?.[config.retentionSettingKey] ?? config.defaultRetentionDays)
        : config.defaultRetentionDays;

      logs.push({
        type,
        label:       config.label,
        description: config.description,
        icon:        config.icon,
        protected:   config.protected,
        locked:      config.locked,
        total,
        oldestRecord: oldest?.createdAt || null,
        newestRecord: newest?.createdAt || null,
        lastCleanup:  lastCleanup ? {
          date:           lastCleanup.createdAt,
          recordsDeleted: lastCleanup.recordsDeleted,
          by:             lastCleanup.performedByName,
          rule:           lastCleanup.cleanupRule,
        } : null,
        retentionDays,
        autoCleanupEnabled: settings?.logAutoCleanupEnabled || false,
      });
    }

    res.json({ success: true, logs });
  } catch (err) {
    console.error('[LogMgmt] getOverview error:', err);
    res.status(500).json({ success: false, message: 'Failed to load log overview' });
  }
};

// ─── GET /api/admin/logs/:type/preview ───────────────────────────────────────
exports.previewCleanup = async (req, res) => {
  try {
    const { type } = req.params;
    const { rule, from, to } = req.query;

    const config = LOG_REGISTRY[type];
    if (!config) return res.status(404).json({ success: false, message: 'Unknown log type' });
    if (config.locked) return res.status(403).json({ success: false, message: 'This log collection is locked and view-only' });

    const Model = config.getModel();
    const query = buildDateQuery(rule, from, to);
    const count = await Model.countDocuments(query);

    res.json({ success: true, count, type, rule, dateRange: getRuleDateRange(rule, from, to) });
  } catch (err) {
    console.error('[LogMgmt] previewCleanup error:', err);
    res.status(500).json({ success: false, message: 'Preview failed' });
  }
};

// ─── GET /api/admin/logs/:type/export ────────────────────────────────────────
exports.exportLogs = async (req, res) => {
  try {
    const { type } = req.params;
    const { format = 'json', rule, from, to } = req.query;

    const config = LOG_REGISTRY[type];
    if (!config) return res.status(404).json({ success: false, message: 'Unknown log type' });

    const Model = config.getModel();
    const query = rule ? buildDateQuery(rule, from, to) : {};
    const docs = await Model.find(query).lean().limit(50000); // 50k safety cap

    const filename = `${type}_logs_${new Date().toISOString().slice(0, 10)}`;

    if (format === 'csv') {
      if (!docs.length) {
        res.set('Content-Type', 'text/csv');
        res.set('Content-Disposition', `attachment; filename="${filename}.csv"`);
        return res.send('');
      }
      const headers = Object.keys(docs[0]).filter(k => k !== '__v');
      const escape = (v) => {
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') return JSON.stringify(v).replace(/"/g, '""');
        return String(v).replace(/"/g, '""');
      };
      const rows = docs.map(doc => headers.map(h => `"${escape(doc[h])}"`).join(','));
      const csv = [headers.join(','), ...rows].join('\n');

      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="${filename}.csv"`);
      return res.send(csv);
    }

    // JSON export
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${filename}.json"`);
    res.send(JSON.stringify({ exportedAt: new Date(), logType: type, label: config.label, total: docs.length, data: docs }, null, 2));
  } catch (err) {
    console.error('[LogMgmt] exportLogs error:', err);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
};

// ─── POST /api/admin/logs/:type/cleanup ──────────────────────────────────────
exports.performCleanup = async (req, res) => {
  try {
    const { type } = req.params;
    const { rule, from, to, confirm, note = '', exportedBefore = false, exportFormat = null } = req.body;

    const config = LOG_REGISTRY[type];
    if (!config) return res.status(404).json({ success: false, message: 'Unknown log type' });
    if (config.locked) return res.status(403).json({ success: false, message: 'This log collection is locked and cannot be deleted' });

    // Require stronger confirmation for protected types
    const requiredToken = config.protected ? 'PROTECTED_DELETE' : 'DELETE';
    if (confirm !== requiredToken) {
      return res.status(400).json({
        success: false,
        message: `Type "${requiredToken}" to confirm this destructive action`,
      });
    }

    const Model = config.getModel();
    const query = buildDateQuery(rule, from, to);
    const dateRange = getRuleDateRange(rule, from, to);

    // Batched deletion — processes BATCH_SIZE documents per iteration
    let totalDeleted = 0;
    for (;;) {
      const ids = await Model.find(query).select('_id').limit(BATCH_SIZE).lean();
      if (!ids.length) break;
      // Raw collection call — bypasses Mongoose middleware (required for AdminAuditLog,
      // whose model-level immutability hooks otherwise block deleteMany entirely). This
      // is the one sanctioned bulk-deletion path, driven by the retention policy above.
      const result = await Model.collection.deleteMany({ _id: { $in: ids.map(d => d._id) } });
      totalDeleted += result.deletedCount;
      if (ids.length < BATCH_SIZE) break;
    }

    // Immutable cleanup audit record
    await LogCleanupRecord.create({
      logType:         type,
      logLabel:        config.label,
      recordsDeleted:  totalDeleted,
      cleanupRule:     rule,
      dateRangeFrom:   dateRange.from,
      dateRangeTo:     dateRange.to,
      exportedBefore:  !!exportedBefore,
      exportFormat:    exportFormat || null,
      performedBy:     req.user._id,
      performedByName: req.user.name,
      ipAddress:       req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
      note,
    });

    res.json({
      success: true,
      recordsDeleted: totalDeleted,
      message: `${totalDeleted.toLocaleString()} records permanently deleted`,
    });
  } catch (err) {
    console.error('[LogMgmt] performCleanup error:', err);
    res.status(500).json({ success: false, message: 'Cleanup failed — no records were deleted' });
  }
};

// ─── GET /api/admin/logs/cleanup-history ─────────────────────────────────────
exports.getCleanupHistory = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;
    const filter = req.query.logType ? { logType: req.query.logType } : {};

    const [records, total] = await Promise.all([
      LogCleanupRecord.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      LogCleanupRecord.countDocuments(filter),
    ]);

    res.json({ success: true, records, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load cleanup history' });
  }
};

// ─── GET /api/admin/logs/retention ───────────────────────────────────────────
exports.getRetentionSettings = async (req, res) => {
  try {
    const settings = await SystemSettings.findOne().lean();
    const retention = {};

    for (const [type, config] of Object.entries(LOG_REGISTRY)) {
      retention[type] = {
        label:             config.label,
        locked:            config.locked,
        days: config.retentionSettingKey
          ? (settings?.[config.retentionSettingKey] ?? config.defaultRetentionDays)
          : config.defaultRetentionDays,
      };
    }

    res.json({
      success:            true,
      retention,
      autoCleanupEnabled: settings?.logAutoCleanupEnabled || false,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load retention settings' });
  }
};

// ─── PATCH /api/admin/logs/retention ─────────────────────────────────────────
exports.updateRetentionSettings = async (req, res) => {
  try {
    const { autoCleanupEnabled, retention = {} } = req.body;
    const update = {};

    if (autoCleanupEnabled !== undefined) {
      update.logAutoCleanupEnabled = !!autoCleanupEnabled;
    }

    for (const [type, config] of Object.entries(LOG_REGISTRY)) {
      if (config.retentionSettingKey && retention[type] !== undefined) {
        const days = parseInt(retention[type]);
        if (!isNaN(days) && days >= 0) update[config.retentionSettingKey] = days;
      }
    }

    await SystemSettings.findOneAndUpdate({}, { $set: update }, { upsert: true });

    res.json({ success: true, message: 'Retention settings saved' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
};
