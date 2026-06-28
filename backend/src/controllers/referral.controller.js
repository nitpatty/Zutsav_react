const Referral = require('../models/Referral');
const Pandit   = require('../models/Pandit');
const User     = require('../models/User');
const { NotificationEngine } = require('../../notification-engine');

const BASE_URL = () => process.env.CLIENT_URL || 'http://localhost:3000';

// ── POST /api/referrals ── pandit creates a referral link ──────────────────
exports.createReferral = async (req, res, next) => {
  try {
    const { userMobile, userEmail, poojaId, preferredDate } = req.body;

    if (!userMobile || !/^\d{10}$/.test(String(userMobile).trim())) {
      return res.status(400).json({ success: false, message: 'A valid 10-digit mobile number is required.' });
    }

    const pandit = await Pandit.findOne({ userId: req.user._id, status: 'approved' });
    if (!pandit) {
      return res.status(403).json({ success: false, message: 'Only approved pandits can create referral links.' });
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const referral = await Referral.create({
      panditId:      pandit._id,
      userMobile:    String(userMobile).trim(),
      userEmail:     (userEmail || '').trim().toLowerCase(),
      poojaId:       poojaId   || null,
      preferredDate: preferredDate ? new Date(preferredDate) : null,
      expiresAt,
      statusHistory: [{ status: 'CREATED', note: 'Referral created by pandit' }],
    });

    const link = `${BASE_URL()}/r/${referral.token}`;
    res.status(201).json({ success: true, referral, link });
  } catch (err) { next(err); }
};

// ── GET /api/referrals/validate/:token ── public, validates token ──────────
exports.validateToken = async (req, res, next) => {
  try {
    const referral = await Referral.findOne({ token: req.params.token })
      .populate('panditId', 'name profilePhoto city experience languages specializations kycStatus status')
      .populate('poojaId',  'name image description price salePrice duration slug');

    if (!referral) {
      return res.status(404).json({ success: false, message: 'Referral link not found.' });
    }
    if (referral.expiresAt < new Date()) {
      return res.status(410).json({ success: false, expired: true, message: 'This referral link has expired.' });
    }
    if (['BOOKED','PENDING_REMARK','REMARK_SUBMITTED','ADMIN_REVIEW','ASSIGNED','COMPLETED','SETTLED'].includes(referral.status)) {
      return res.status(409).json({ success: false, alreadyBooked: true, message: 'This referral has already been used for a booking.' });
    }

    // Idempotently advance to OPENED
    if (referral.status === 'CREATED' || referral.status === 'SENT') {
      referral.status = 'OPENED';
      referral.statusHistory.push({ status: 'OPENED', note: 'Referral link opened by user' });
      await referral.save();
    }

    res.json({ success: true, referral });
  } catch (err) { next(err); }
};

// ── GET /api/referrals/my ── pandit lists their own referrals ─────────────
exports.getMyReferrals = async (req, res, next) => {
  try {
    const pandit = await Pandit.findOne({ userId: req.user._id });
    if (!pandit) return res.status(404).json({ success: false, message: 'Pandit profile not found' });

    const { page = 1, limit = 20, status } = req.query;
    const query = { panditId: pandit._id };
    if (status) query.status = status;

    const [referrals, total] = await Promise.all([
      Referral.find(query)
        .populate('poojaId',   'name image')
        .populate('bookingId', 'bookingNumber status scheduledDate userDetails')
        .sort({ createdAt: -1 })
        .limit(+limit)
        .skip((+page - 1) * +limit),
      Referral.countDocuments(query),
    ]);

    const base = BASE_URL();
    const result = referrals.map((r) => ({ ...r.toObject(), link: `${base}/r/${r.token}` }));

    res.json({ success: true, referrals: result, total, page: +page });
  } catch (err) { next(err); }
};

// ── PATCH /api/referrals/:id/remark ── pandit submits mandatory remark ─────
exports.submitRemark = async (req, res, next) => {
  try {
    const { remark } = req.body;
    const trimmed = (remark || '').trim();

    if (!trimmed || trimmed.length < 20) {
      return res.status(400).json({ success: false, message: 'Remark must be at least 20 characters.' });
    }
    if (trimmed.length > 1000) {
      return res.status(400).json({ success: false, message: 'Remark cannot exceed 1000 characters.' });
    }

    const pandit = await Pandit.findOne({ userId: req.user._id });
    if (!pandit) return res.status(404).json({ success: false, message: 'Pandit profile not found' });

    const referral = await Referral.findOne({ _id: req.params.id, panditId: pandit._id });
    if (!referral) return res.status(404).json({ success: false, message: 'Referral not found or does not belong to you.' });

    if (referral.status !== 'PENDING_REMARK') {
      return res.status(400).json({
        success: false,
        message: `Remark can only be submitted when referral status is PENDING_REMARK (current: ${referral.status}).`,
      });
    }

    referral.remark            = trimmed;
    referral.remarkSubmittedAt = new Date();
    referral.status            = 'REMARK_SUBMITTED';
    referral.statusHistory.push({ status: 'REMARK_SUBMITTED', note: 'Pandit submitted mandatory remark' });
    await referral.save();

    NotificationEngine.emit('REFERRAL_REMARK_SUBMITTED', {
      pandit:   { id: String(pandit._id), userId: String(req.user._id), name: pandit.name, phone: pandit.phone, email: pandit.email },
      referral: { referralId: referral._id.toString() },
      reason:   trimmed,
    }).catch(() => {});

    res.json({ success: true, message: 'Remark submitted successfully.', referral });
  } catch (err) { next(err); }
};

// ── PATCH /api/referrals/:id/status ── admin updates referral status ───────
exports.adminUpdateStatus = async (req, res, next) => {
  try {
    const VALID = ['CREATED','SENT','OPENED','BOOKED','PENDING_REMARK','REMARK_SUBMITTED','ADMIN_REVIEW','ASSIGNED','COMPLETED','SETTLED'];
    const { status, note } = req.body;

    if (!VALID.includes(status)) {
      return res.status(400).json({ success: false, message: `status must be one of: ${VALID.join(', ')}` });
    }

    const referral = await Referral.findById(req.params.id);
    if (!referral) return res.status(404).json({ success: false, message: 'Referral not found' });

    referral.status = status;
    referral.statusHistory.push({ status, note: note || `Status updated to ${status} by admin` });
    await referral.save();

    res.json({ success: true, referral });
  } catch (err) { next(err); }
};

// ── GET /api/referrals/admin/list ── admin lists all referrals ─────────────
exports.adminListReferrals = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = {};
    if (status) query.status = status;

    const [referrals, total] = await Promise.all([
      Referral.find(query)
        .populate('panditId',  'name profilePhoto city')
        .populate('poojaId',   'name')
        .populate('bookingId', 'bookingNumber status scheduledDate userDetails grandTotal')
        .sort({ createdAt: -1 })
        .limit(+limit)
        .skip((+page - 1) * +limit),
      Referral.countDocuments(query),
    ]);

    const base = BASE_URL();
    const result = referrals.map((r) => ({ ...r.toObject(), link: `${base}/r/${r.token}` }));

    res.json({ success: true, referrals: result, total, page: +page });
  } catch (err) { next(err); }
};

// ── GET /api/referrals/analytics ── admin analytics ───────────────────────
exports.getReferralAnalytics = async (req, res, next) => {
  try {
    const [totalReferrals, bookedReferrals, completedReferrals, remarkPending, topReferrers] = await Promise.all([
      Referral.countDocuments(),
      Referral.countDocuments({ status: { $in: ['BOOKED','PENDING_REMARK','REMARK_SUBMITTED','ADMIN_REVIEW','ASSIGNED','COMPLETED','SETTLED'] } }),
      Referral.countDocuments({ status: { $in: ['COMPLETED','SETTLED'] } }),
      Referral.countDocuments({ status: 'PENDING_REMARK' }),
      Referral.aggregate([
        { $group: {
          _id:           '$panditId',
          totalCreated:  { $sum: 1 },
          totalBooked:   { $sum: { $cond: [{ $in: ['$status', ['BOOKED','PENDING_REMARK','REMARK_SUBMITTED','ADMIN_REVIEW','ASSIGNED','COMPLETED','SETTLED']] }, 1, 0] } },
          totalCompleted:{ $sum: { $cond: [{ $in: ['$status', ['COMPLETED','SETTLED']] }, 1, 0] } },
        }},
        { $sort: { totalBooked: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'pandits', localField: '_id', foreignField: '_id', as: 'pandit' } },
        { $unwind: { path: '$pandit', preserveNullAndEmpty: true } },
        { $project: { panditName: '$pandit.name', panditCity: '$pandit.city', totalCreated: 1, totalBooked: 1, totalCompleted: 1 } },
      ]),
    ]);

    const conversionRate = totalReferrals > 0 ? Math.round((bookedReferrals / totalReferrals) * 100) : 0;

    res.json({
      success: true,
      stats: { totalReferrals, bookedReferrals, completedReferrals, remarkPending, conversionRate, topReferrers },
    });
  } catch (err) { next(err); }
};

// ── Legacy user referral program (kept for backward compat) ───────────────
exports.getMyReferral = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('name referralCode referralCount');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const referrals = await User.find({ referredBy: req.user._id })
      .select('name createdAt').sort({ createdAt: -1 }).limit(20);

    res.json({ success: true, referralCode: user.referralCode, referralCount: user.referralCount || referrals.length, referrals });
  } catch (err) { next(err); }
};

exports.getAdminReferralStats = async (req, res, next) => {
  try {
    const topReferrers  = await User.aggregate([
      { $match: { referralCount: { $gt: 0 } } },
      { $sort:  { referralCount: -1 } },
      { $limit: 20 },
      { $project: { name: 1, phone: 1, email: 1, referralCode: 1, referralCount: 1, createdAt: 1 } },
    ]);
    const totalReferred = await User.countDocuments({ referredBy: { $ne: null } });
    const usersWithCode = await User.countDocuments({ referralCode: { $ne: null } });

    res.json({ success: true, stats: { totalReferred, usersWithCode, topReferrers } });
  } catch (err) { next(err); }
};
