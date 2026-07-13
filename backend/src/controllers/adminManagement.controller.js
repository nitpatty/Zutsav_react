const crypto        = require('crypto');
const User          = require('../models/User');
const AdminSession  = require('../models/AdminSession');
const LoginHistory  = require('../models/LoginHistory');
const AdminAuditLog = require('../models/AdminAuditLog');
const { audit }     = require('../services/auditService');
const { NotificationEngine }   = require('../../notification-engine');
const { normalizeUserPayload } = require('../../notification-engine/variables/PayloadNormalizer');

const MAX_PAGE_SIZE = 100;
const ONLINE_WINDOW_MS = 15 * 60 * 1000; // "online" = active session seen in the last 15 minutes
const DEFAULT_AUDIT_WINDOW_DAYS = 30;

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function paginate(query) {
  const page  = Math.max(1, +query.page || 1);
  const limit = Math.min(MAX_PAGE_SIZE, +query.limit || 20);
  return { page, limit, skip: (page - 1) * limit };
}

// Single choke point every mutating handler below calls first — this module
// only ever touches plain role:'admin' accounts. It never returns/targets a
// system_admin, user, or pandit, which is what enforces "Admin can't edit
// System Admin" and "System Admin can't accidentally touch another
// System Admin" at the same time.
async function loadTargetAdminOrFail(req, res) {
  const target = await User.findById(req.params.id);
  if (!target || target.isDeleted) {
    res.status(404).json({ success: false, message: 'Admin not found' });
    return null;
  }
  if (target.role !== 'admin') {
    res.status(403).json({ success: false, message: 'This account cannot be managed here' });
    return null;
  }
  return target;
}

// ── GET /api/admin-management/dashboard ───────────────────────────────────────
exports.getDashboardStats = async (req, res, next) => {
  try {
    const [total, active, suspended, recentlyCreated, onlineUserIds] = await Promise.all([
      User.countDocuments({ role: 'admin', isDeleted: false }),
      User.countDocuments({ role: 'admin', isDeleted: false, isActive: true }),
      User.countDocuments({ role: 'admin', isDeleted: false, isActive: false }),
      User.find({ role: 'admin', isDeleted: false }).sort({ createdAt: -1 }).limit(5)
        .select('name email phone createdAt profilePhoto').lean(),
      // distinct() so one admin logged in from several devices/tabs counts once,
      // not once per session.
      AdminSession.distinct('userId', { isActive: true, lastSeenAt: { $gte: new Date(Date.now() - ONLINE_WINDOW_MS) } }),
    ]);

    // Scope "online" to the same role:'admin' population as the tiles above —
    // a session belonging to the System Admin's own account shouldn't count
    // toward the Admin Management dashboard's admin-facing stats.
    const online = await User.countDocuments({ _id: { $in: onlineUserIds }, role: 'admin', isDeleted: false });

    res.json({ success: true, stats: { total, active, suspended, online, recentlyCreated } });
  } catch (err) { next(err); }
};

// ── GET /api/admin-management/admins ──────────────────────────────────────────
exports.listAdmins = async (req, res, next) => {
  try {
    const { search, status } = req.query;
    const { page, limit, skip } = paginate(req.query);

    const query = { role: 'admin', isDeleted: false };
    if (status === 'active')    query.isActive = true;
    if (status === 'suspended') query.isActive = false;
    if (search) {
      const re = new RegExp(search.trim(), 'i');
      query.$or = [{ name: re }, { email: re }, { phone: re }, { employeeId: re }, { department: re }];
    }

    const [admins, total] = await Promise.all([
      User.find(query).select('-password')
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(query),
    ]);

    res.json({ success: true, admins, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
};

// ── GET /api/admin-management/admins/:id ──────────────────────────────────────
exports.getAdminDetail = async (req, res, next) => {
  try {
    const admin = await User.findOne({ _id: req.params.id, role: 'admin', isDeleted: false })
      .select('-password').populate('createdBy', 'name email').lean();
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
    res.json({ success: true, admin });
  } catch (err) { next(err); }
};

// ── POST /api/admin-management/admins ─────────────────────────────────────────
exports.createAdmin = async (req, res, next) => {
  try {
    const { name, email, phone, password, employeeId, department, designation } = req.body;
    if (!name || !phone || !password) {
      return res.status(400).json({ success: false, message: 'Name, phone, and password are required' });
    }

    // role is never read from the request body — hardcoded. This endpoint
    // can never create a system_admin, only a plain admin.
    const admin = await User.create({
      name, email, phone, password, employeeId, department, designation,
      role: 'admin',
      createdBy: req.user._id,
      profilePhoto: req.file ? `uploads/profiles/${req.file.filename}` : null,
    });

    audit(req, {
      module: 'admin_management', action: 'admin_created', severity: 'warning',
      targetType: 'user', targetId: admin._id, targetName: admin.name,
      targetEmail: admin.email || '', targetPhone: admin.phone,
      newValues: { name, email, phone, employeeId, department, designation, role: 'admin' },
    }).catch(() => {});
    NotificationEngine.emit('ADMIN_CREATED', normalizeUserPayload({ user: admin, actor: req.user })).catch(() => {});

    const result = admin.toObject();
    delete result.password;
    res.status(201).json({ success: true, admin: result });
  } catch (err) { next(err); }
};

// ── PATCH /api/admin-management/admins/:id ────────────────────────────────────
exports.updateAdmin = async (req, res, next) => {
  try {
    const target = await loadTargetAdminOrFail(req, res);
    if (!target) return;

    const { name, email, phone, employeeId, department, designation } = req.body;
    const oldValues = {
      name: target.name, email: target.email, phone: target.phone,
      employeeId: target.employeeId, department: target.department, designation: target.designation,
    };

    if (name !== undefined)        target.name = name;
    if (email !== undefined)       target.email = email;
    if (phone !== undefined)       target.phone = phone;
    if (employeeId !== undefined)  target.employeeId = employeeId;
    if (department !== undefined)  target.department = department;
    if (designation !== undefined) target.designation = designation;
    if (req.file) target.profilePhoto = `uploads/profiles/${req.file.filename}`;
    // role is never mutable via this endpoint — an admin's role can only be
    // changed by re-running the migration script, never through the UI/API.

    await target.save();

    audit(req, {
      module: 'admin_management', action: 'admin_updated',
      targetType: 'user', targetId: target._id, targetName: target.name,
      oldValues, newValues: { name, email, phone, employeeId, department, designation },
    }).catch(() => {});
    NotificationEngine.emit('ADMIN_UPDATED', normalizeUserPayload({ user: target, actor: req.user })).catch(() => {});

    const result = target.toObject();
    delete result.password;
    res.json({ success: true, admin: result });
  } catch (err) { next(err); }
};

// ── PATCH /api/admin-management/admins/:id/suspend ────────────────────────────
exports.suspendAdmin = async (req, res, next) => {
  try {
    const target = await loadTargetAdminOrFail(req, res);
    if (!target) return;

    target.isActive = false;
    await target.save();
    await AdminSession.updateMany(
      { userId: target._id, isActive: true },
      { isActive: false, revokedAt: new Date(), revokedBy: req.user._id, revokedReason: 'suspended' }
    );

    audit(req, {
      module: 'admin_management', action: 'admin_suspended', severity: 'warning',
      targetType: 'user', targetId: target._id, targetName: target.name,
      oldValues: { isActive: true }, newValues: { isActive: false },
    }).catch(() => {});
    NotificationEngine.emit('ADMIN_SUSPENDED', normalizeUserPayload({ user: target, actor: req.user })).catch(() => {});

    res.json({ success: true, message: 'Admin suspended' });
  } catch (err) { next(err); }
};

// ── PATCH /api/admin-management/admins/:id/activate ───────────────────────────
exports.activateAdmin = async (req, res, next) => {
  try {
    const target = await loadTargetAdminOrFail(req, res);
    if (!target) return;

    target.isActive = true;
    await target.save();

    audit(req, {
      module: 'admin_management', action: 'admin_activated',
      targetType: 'user', targetId: target._id, targetName: target.name,
      oldValues: { isActive: false }, newValues: { isActive: true },
    }).catch(() => {});
    NotificationEngine.emit('ADMIN_ACTIVATED', normalizeUserPayload({ user: target, actor: req.user })).catch(() => {});

    res.json({ success: true, message: 'Admin activated' });
  } catch (err) { next(err); }
};

// ── POST /api/admin-management/admins/:id/reset-password ─────────────────────
exports.resetAdminPassword = async (req, res, next) => {
  try {
    const target = await loadTargetAdminOrFail(req, res);
    if (!target) return;

    const tempPassword = crypto.randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
    target.password = tempPassword; // hashed by the User pre('save') hook
    await target.save();

    // A stolen session should not survive a remediating password reset.
    await AdminSession.updateMany(
      { userId: target._id, isActive: true },
      { isActive: false, revokedAt: new Date(), revokedBy: req.user._id, revokedReason: 'password_reset' }
    );

    audit(req, {
      module: 'admin_management', action: 'admin_password_reset', severity: 'critical',
      targetType: 'user', targetId: target._id, targetName: target.name,
    }).catch(() => {});
    NotificationEngine.emit('ADMIN_PASSWORD_RESET', normalizeUserPayload({ user: target, actor: req.user, tempPassword })).catch(() => {});

    res.json({ success: true, message: 'Password reset', tempPassword });
  } catch (err) { next(err); }
};

// ── DELETE /api/admin-management/admins/:id  (soft delete) ────────────────────
exports.softDeleteAdmin = async (req, res, next) => {
  try {
    // Defense-in-depth: a system_admin's own account is never role:'admin',
    // so loadTargetAdminOrFail already can't match self — but assert explicitly.
    if (String(req.params.id) === String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'You cannot delete your own account' });
    }
    const target = await loadTargetAdminOrFail(req, res);
    if (!target) return;

    const oldValues = { isDeleted: false, isActive: target.isActive };
    target.isDeleted = true;
    target.deletedAt = new Date();
    target.deletedBy = req.user._id;
    target.isActive  = false; // also blocks login immediately via protect()
    await target.save();

    await AdminSession.updateMany(
      { userId: target._id, isActive: true },
      { isActive: false, revokedAt: new Date(), revokedBy: req.user._id, revokedReason: 'admin_deleted' }
    );

    audit(req, {
      module: 'admin_management', action: 'admin_soft_deleted', severity: 'critical',
      targetType: 'user', targetId: target._id, targetName: target.name,
      oldValues, newValues: { isDeleted: true, isActive: false },
    }).catch(() => {});
    NotificationEngine.emit('ADMIN_SUSPENDED', normalizeUserPayload({ user: target, actor: req.user })).catch(() => {});

    res.json({ success: true, message: 'Admin account deleted' });
  } catch (err) { next(err); }
};

// ── GET /api/admin-management/admins/:id/login-history ────────────────────────
exports.getLoginHistory = async (req, res, next) => {
  try {
    const { page, limit, skip } = paginate(req.query);
    const [history, total] = await Promise.all([
      LoginHistory.find({ userId: req.params.id }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      LoginHistory.countDocuments({ userId: req.params.id }),
    ]);
    res.json({ success: true, history, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
};

// ── GET /api/admin-management/admins/:id/sessions ──────────────────────────────
exports.getAdminSessions = async (req, res, next) => {
  try {
    const sessions = await AdminSession.find({ userId: req.params.id })
      .sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, sessions });
  } catch (err) { next(err); }
};

// ── POST /api/admin-management/admins/:id/sessions/:sid/revoke ────────────────
exports.revokeSession = async (req, res, next) => {
  try {
    const session = await AdminSession.findOneAndUpdate(
      { sid: req.params.sid, userId: req.params.id, isActive: true },
      { isActive: false, revokedAt: new Date(), revokedBy: req.user._id, revokedReason: 'force_logout' },
      { new: true }
    );
    if (!session) return res.status(404).json({ success: false, message: 'Active session not found' });

    LoginHistory.create({ userId: req.params.id, event: 'force_logout', sessionId: req.params.sid }).catch(() => {});
    audit(req, {
      module: 'admin_management', action: 'session_revoked', severity: 'warning',
      targetType: 'user', targetId: req.params.id, note: `Session ${req.params.sid} revoked`,
    }).catch(() => {});

    res.json({ success: true, message: 'Session revoked' });
  } catch (err) { next(err); }
};

// ── POST /api/admin-management/admins/:id/force-logout ────────────────────────
exports.forceLogoutAll = async (req, res, next) => {
  try {
    const target = await loadTargetAdminOrFail(req, res);
    if (!target) return;

    const result = await AdminSession.updateMany(
      { userId: target._id, isActive: true },
      { isActive: false, revokedAt: new Date(), revokedBy: req.user._id, revokedReason: 'force_logout' }
    );

    LoginHistory.create({ userId: target._id, event: 'force_logout' }).catch(() => {});
    audit(req, {
      module: 'admin_management', action: 'force_logout_all', severity: 'warning',
      targetType: 'user', targetId: target._id, targetName: target.name,
      note: `${result.modifiedCount} session(s) revoked`,
    }).catch(() => {});

    res.json({ success: true, message: `${result.modifiedCount} session(s) revoked` });
  } catch (err) { next(err); }
};

// ── GET /api/admin-management/audit-logs ───────────────────────────────────────
exports.listAuditLogs = async (req, res, next) => {
  try {
    const { module: moduleFilter, action, performedBy, from, to } = req.query;
    const { page, limit, skip } = paginate(req.query);

    const query = {};
    if (moduleFilter) query.module = moduleFilter;
    if (action)       query.action = action;
    if (performedBy)  query.performedBy = performedBy;

    // Bounded window by default — never scan the full collection unfiltered
    // at 100k+/millions-of-rows scale.
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to)   query.createdAt.$lte = new Date(to);
    } else {
      query.createdAt = { $gte: daysAgo(DEFAULT_AUDIT_WINDOW_DAYS) };
    }

    const [logs, total] = await Promise.all([
      AdminAuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AdminAuditLog.countDocuments(query),
    ]);

    res.json({ success: true, logs, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
};

// ── GET /api/admin-management/audit-logs/:id ───────────────────────────────────
exports.getAuditLogDetail = async (req, res, next) => {
  try {
    const log = await AdminAuditLog.findById(req.params.id).lean();
    if (!log) return res.status(404).json({ success: false, message: 'Audit log not found' });
    res.json({ success: true, log });
  } catch (err) { next(err); }
};
