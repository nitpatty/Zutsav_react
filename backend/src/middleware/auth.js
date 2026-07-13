const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AdminSession = require('../models/AdminSession');

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user || !user.isActive || user.isDeleted) {
      return res.status(401).json({ success: false, message: 'User not found or inactive' });
    }

    // Tokens signed before this feature carry no `v` claim at all — those
    // are left alone (undefined !== undefined check below would incorrectly
    // reject them against a fresh tokenVersion of 0). Only a token whose `v`
    // explicitly disagrees with the user's current tokenVersion is rejected —
    // this is what makes password reset able to invalidate every previously-
    // issued token instantly, without needing per-session DB records.
    if (decoded.v !== undefined && decoded.v !== user.tokenVersion) {
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
    }

    // Session validation — only for tokens carrying a `sid` claim (admin-tier
    // tokens signed after this change). Tokens without `sid` (all pre-existing
    // tokens, and every non-admin-tier token forever) skip this block entirely:
    // zero behavior change, zero extra DB round-trip for regular users/pandits.
    if (decoded.sid) {
      const session = await AdminSession.findOne({ sid: decoded.sid }).lean();
      if (!session || !session.isActive || session.expiresAt < new Date()) {
        return res.status(401).json({ success: false, message: 'Session expired or revoked' });
      }
      req.sid = decoded.sid;
      // Fire-and-forget — do not await, keep protect() fast.
      AdminSession.updateOne({ sid: decoded.sid }, { lastSeenAt: new Date() }).catch(() => {});
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

/**
 * Same JWT verification as protect(), but never 401s — attaches req.user
 * when a valid token is present, otherwise just calls next() with no user.
 * For endpoints that should work for guests but personalize when logged in
 * (e.g. the guided AI recommendation flow).
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return next();

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    const tokenVersionOk = decoded.v === undefined || decoded.v === user?.tokenVersion;
    if (user && user.isActive && !user.isDeleted && tokenVersionOk) {
      req.user = user;
    }
    next();
  } catch {
    // Invalid/expired token on an optional-auth route — proceed as a guest
    // rather than rejecting the request.
    next();
  }
};

const authorize = (...roles) => (req, res, next) => {
  // system_admin is an implicit superset of every role check — one-directional:
  // system_admin always passes, but a plain admin hitting a route gated with
  // authorize('system_admin') still fails the whitelist check below.
  if (req.user.role === 'system_admin') return next();
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  next();
};

module.exports = { protect, authorize, optionalAuth };
