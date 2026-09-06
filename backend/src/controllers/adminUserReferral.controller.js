/**
 * Admin User Referral Controller — manages User Referral codes, settings,
 * booking reward approval/denial, and overview analytics.
 *
 * Routes are mounted under /api/admin/user-referrals and /api/admin/booking-rewards.
 * All endpoints require admin authorization.
 */

const UserReferralCode = require('../models/UserReferralCode');
const UserReferralBookingReward = require('../models/UserReferralBookingReward');
const UserWallet = require('../models/UserWallet');
const WalletTransaction = require('../models/WalletTransaction');
const User = require('../models/User');
const settings = require('../utils/settingsService');
const walletService = require('../services/walletService');

// ── Overview / Analytics ────────────────────────────────────────────────────
exports.getOverview = async (req, res, next) => {
  try {
    const [
      totalCodes,
      availableCodes,
      usedCodes,
      expiredCodes,
      totalBookingRewards,
      pendingRewards,
      approvedRewards,
      deniedRewards,
    ] = await Promise.all([
      UserReferralCode.countDocuments(),
      UserReferralCode.countDocuments({ status: 'AVAILABLE', expiresAt: { $gt: new Date() } }),
      UserReferralCode.countDocuments({ status: 'USED' }),
      UserReferralCode.countDocuments({
        $or: [{ status: 'EXPIRED' }, { status: 'AVAILABLE', expiresAt: { $lte: new Date() } }],
      }),
      UserReferralBookingReward.countDocuments(),
      UserReferralBookingReward.countDocuments({ status: 'PENDING' }),
      UserReferralBookingReward.countDocuments({ status: 'APPROVED' }),
      UserReferralBookingReward.countDocuments({ status: 'DENIED' }),
    ]);

    // Total registration reward coins issued
    const registrationRewardAgg = await WalletTransaction.aggregate([
      { $match: { type: 'REFERRAL_REGISTRATION', direction: 'CREDIT', status: 'COMPLETED' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const registrationRewardCoins = registrationRewardAgg[0]?.total || 0;

    // Total booking reward coins issued
    const bookingRewardAgg = await WalletTransaction.aggregate([
      { $match: { type: 'REFERRAL_BOOKING_REWARD', direction: 'CREDIT', status: 'COMPLETED' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const bookingRewardCoins = bookingRewardAgg[0]?.total || 0;

    // Unique successful referred users
    const uniqueReferredUsers = await UserReferralCode.countDocuments({ status: 'USED' });

    res.json({
      success: true,
      overview: {
        totalCodes,
        availableCodes,
        usedCodes,
        expiredCodes,
        uniqueReferredUsers,
        registrationRewardCoins,
        bookingRewardCoins,
        totalBookingRewards,
        pendingRewards,
        approvedRewards,
        deniedRewards,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── List Referral Codes (paginated, filterable) ─────────────────────────────
exports.listCodes = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      search,
      startDate,
      endDate,
    } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Search by code, referrer name, or referred user name
    if (search) {
      const regex = new RegExp(search, 'i');
      const matchingUsers = await User.find({
        $or: [{ name: regex }, { email: regex }, { phone: regex }],
      }).select('_id').lean();
      const userIds = matchingUsers.map(u => u._id);

      filter.$or = [
        { code: regex },
        { userId: { $in: userIds } },
        { usedBy: { $in: userIds } },
      ];
    }

    const total = await UserReferralCode.countDocuments(filter);
    const codes = await UserReferralCode.find(filter)
      .populate('userId', 'name email phone')
      .populate('usedBy', 'name email phone')
      .sort({ createdAt: -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit)
      .lean();

    // Enrich with expired flag
    const enriched = codes.map((c) => ({
      ...c,
      isExpired: c.status === 'AVAILABLE' && c.expiresAt < new Date(),
      referrerName: c.userId?.name || '—',
      referrerEmail: c.userId?.email || '',
      referredUserName: c.usedBy?.name || null,
      referredUserEmail: c.usedBy?.email || '',
    }));

    res.json({
      success: true,
      codes: enriched,
      total,
      page: +page,
      totalPages: Math.ceil(total / +limit),
    });
  } catch (err) {
    next(err);
  }
};

// ── Referral Settings ───────────────────────────────────────────────────────
exports.getSettings = async (req, res, next) => {
  try {
    const [
      enabled,
      validityDays,
      dailyLimit,
      registrationReward,
      bookingReward,
      maxRewardedBookings,
    ] = await Promise.all([
      settings.get('userReferralEnabled', false),
      settings.get('userReferralDefaultValidityDays', 30),
      settings.get('userReferralDailyLimit', 5),
      settings.get('userReferralRegistrationRewardCoins', 10),
      settings.get('userReferralBookingRewardCoins', 50),
      settings.get('maxRewardedBookingsPerReferredUser', 5),
    ]);

    res.json({
      success: true,
      settings: {
        userReferralEnabled: enabled,
        userReferralDefaultValidityDays: validityDays,
        userReferralDailyLimit: dailyLimit,
        userReferralRegistrationRewardCoins: registrationReward,
        userReferralBookingRewardCoins: bookingReward,
        maxRewardedBookingsPerReferredUser: maxRewardedBookings,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const SystemSettings = require('../models/SystemSettings');
    const update = {};
    const allowed = [
      'userReferralEnabled',
      'userReferralDefaultValidityDays',
      'userReferralDailyLimit',
      'userReferralRegistrationRewardCoins',
      'userReferralBookingRewardCoins',
      'maxRewardedBookingsPerReferredUser',
    ];

    // Validate and sanitize
    if (req.body.userReferralEnabled !== undefined) {
      update.userReferralEnabled = req.body.userReferralEnabled === true || req.body.userReferralEnabled === 'true';
    }
    if (req.body.userReferralDefaultValidityDays !== undefined) {
      const v = Number(req.body.userReferralDefaultValidityDays);
      if (isNaN(v) || v < 0) return res.status(400).json({ success: false, message: 'Validity must be a non-negative number' });
      update.userReferralDefaultValidityDays = v;
    }
    if (req.body.userReferralDailyLimit !== undefined) {
      const v = Number(req.body.userReferralDailyLimit);
      if (isNaN(v) || v < 1 || !Number.isInteger(v)) return res.status(400).json({ success: false, message: 'Daily limit must be a positive integer' });
      update.userReferralDailyLimit = v;
    }
    if (req.body.userReferralRegistrationRewardCoins !== undefined) {
      const v = Number(req.body.userReferralRegistrationRewardCoins);
      if (isNaN(v) || v < 0 || !Number.isInteger(v)) return res.status(400).json({ success: false, message: 'Registration reward must be a non-negative integer' });
      update.userReferralRegistrationRewardCoins = v;
    }
    if (req.body.userReferralBookingRewardCoins !== undefined) {
      const v = Number(req.body.userReferralBookingRewardCoins);
      if (isNaN(v) || v < 0 || !Number.isInteger(v)) return res.status(400).json({ success: false, message: 'Booking reward must be a non-negative integer' });
      update.userReferralBookingRewardCoins = v;
    }
    if (req.body.maxRewardedBookingsPerReferredUser !== undefined) {
      const v = Number(req.body.maxRewardedBookingsPerReferredUser);
      // 0 is allowed (disables booking rewards); negative values are rejected.
      if (isNaN(v) || v < 0 || !Number.isInteger(v)) return res.status(400).json({ success: false, message: 'Max rewarded bookings must be a non-negative integer' });
      update.maxRewardedBookingsPerReferredUser = v;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid settings provided' });
    }

    await SystemSettings.findOneAndUpdate(
      {},
      { $set: update },
      { new: true, upsert: true, runValidators: true },
    );

    // Invalidate settings cache
    const settingsService = require('../utils/settingsService');
    settingsService.invalidate();

    res.json({ success: true, message: 'Settings updated', settings: update });
  } catch (err) {
    next(err);
  }
};

// ── Booking Rewards ─────────────────────────────────────────────────────────
exports.listBookingRewards = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      search,
      startDate,
      endDate,
    } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    if (search) {
      const regex = new RegExp(search, 'i');
      const matchingUsers = await User.find({
        $or: [{ name: regex }, { email: regex }, { phone: regex }],
      }).select('_id').lean();
      const userIds = matchingUsers.map(u => u._id);

      filter.$or = [
        { userId: { $in: userIds } },
        { referredUserId: { $in: userIds } },
      ];
    }

    const total = await UserReferralBookingReward.countDocuments(filter);
    const rewards = await UserReferralBookingReward.find(filter)
      .populate('userId', 'name email phone')
      .populate('referredUserId', 'name email phone')
      .populate('bookingId', 'bookingNumber scheduledDate scheduledTime grandTotal')
      .sort({ createdAt: -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit)
      .lean();

    res.json({
      success: true,
      rewards,
      total,
      page: +page,
      totalPages: Math.ceil(total / +limit),
    });
  } catch (err) {
    next(err);
  }
};

// ── Approve Booking Reward ──────────────────────────────────────────────────
exports.approveReward = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { note } = req.body || {};

    const reward = await UserReferralBookingReward.findById(id);
    if (!reward) return res.status(404).json({ success: false, message: 'Booking reward not found' });
    if (reward.status !== 'PENDING') {
      return res.status(409).json({ success: false, message: `Reward is already ${reward.status.toLowerCase()}` });
    }

    // Get configured reward amount (snapshot from settings at approval time)
    const rewardAmount = await settings.get('userReferralBookingRewardCoins', 50);

    // Credit wallet using WalletService (object signature — idempotent via key)
    const idempotencyKey = `referral_booking_reward_${reward._id}`;
    await walletService.credit({
      userId: reward.userId,
      amount: rewardAmount,
      type: 'REFERRAL_BOOKING_REWARD',
      description: `Booking reward for completed pooja (Booking #${reward.bookingId?.bookingNumber || 'N/A'})`,
      idempotencyKey,
      reference: { type: 'UserReferralBookingReward', id: reward._id },
      createdBy: req.user._id,
    });

    // Update reward record
    reward.status = 'APPROVED';
    reward.rewardAmount = rewardAmount;
    reward.adminDecisionBy = req.user._id;
    reward.adminDecisionAt = new Date();
    reward.adminNote = note || '';
    reward.coinsCredited = true;
    reward.coinsCreditedAt = new Date();
    await reward.save();

    res.json({
      success: true,
      message: `Approved ${rewardAmount} coins credited to referrer`,
      reward,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    next(err);
  }
};

// ── Deny Booking Reward ─────────────────────────────────────────────────────
exports.denyReward = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { note } = req.body || {};

    const reward = await UserReferralBookingReward.findById(id);
    if (!reward) return res.status(404).json({ success: false, message: 'Booking reward not found' });
    if (reward.status !== 'PENDING') {
      return res.status(409).json({ success: false, message: `Reward is already ${reward.status.toLowerCase()}` });
    }

    reward.status = 'DENIED';
    reward.adminDecisionBy = req.user._id;
    reward.adminDecisionAt = new Date();
    reward.adminNote = note || '';
    await reward.save();

    res.json({
      success: true,
      message: 'Booking reward denied',
      reward,
    });
  } catch (err) {
    next(err);
  }
};
