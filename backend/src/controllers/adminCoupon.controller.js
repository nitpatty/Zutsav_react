/**
 * Admin Coupon Controller — CRUD operations for coupons, activation/deactivation,
 * and viewing redemption history.
 *
 * Routes are mounted under /api/admin/coupons.
 * All endpoints require admin authorization.
 */

const Coupon = require('../models/Coupon');
const CouponRedemption = require('../models/CouponRedemption');
const User = require('../models/User');
const { audit } = require('../services/auditService');

// ── List coupons (paginated) ────────────────────────────────────────────────
exports.listCoupons = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, isActive, applicability } = req.query;

    const filter = {};
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (applicability) filter.applicability = applicability;
    if (search) {
      const regex = new RegExp(search, 'i');
      filter.code = regex;
    }

    const total = await Coupon.countDocuments(filter);
    const coupons = await Coupon.find(filter)
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit)
      .lean();

    res.json({
      success: true,
      coupons,
      total,
      page: +page,
      totalPages: Math.ceil(total / +limit),
    });
  } catch (err) {
    next(err);
  }
};

// ── Get single coupon ───────────────────────────────────────────────────────
exports.getCoupon = async (req, res, next) => {
  try {
    const coupon = await Coupon.findById(req.params.id)
      .populate('createdBy', 'name')
      .lean();
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });

    // Get redemption count
    const redemptionCount = await CouponRedemption.countDocuments({ couponId: coupon._id });

    // Get per-user redemption counts (top users)
    const perUserCounts = await CouponRedemption.aggregate([
      { $match: { couponId: coupon._id } },
      { $group: { _id: '$userId', count: { $sum: 1 }, totalDiscount: { $sum: '$discountApplied' } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]);

    // Populate user names
    const userIds = perUserCounts.map(u => u._id);
    const users = await User.find({ _id: { $in: userIds } }).select('name email phone').lean();
    const userMap = {};
    users.forEach(u => { userMap[u._id] = u; });

    const perUser = perUserCounts.map(u => ({
      user: userMap[u._id] || { name: 'Unknown' },
      count: u.count,
      totalDiscount: u.totalDiscount,
    }));

    res.json({
      success: true,
      coupon: {
        ...coupon,
        currentRedemptionCount: redemptionCount,
        perUserRedemptions: perUser,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── Create coupon ───────────────────────────────────────────────────────────
exports.createCoupon = async (req, res, next) => {
  try {
    const {
      code,
      discountType = 'FIXED',
      discountValue,
      minCartValue = 0,
      maxDiscount = null,
      validFrom,
      expiresAt,
      usageLimit = null,
      perUserLimit = null,
      applicability = ['POOJA'],
    } = req.body;

    // Validation
    if (!code || !code.trim()) return res.status(400).json({ success: false, message: 'Coupon code is required' });
    if (!discountValue || isNaN(discountValue) || Number(discountValue) <= 0) {
      return res.status(400).json({ success: false, message: 'Discount value must be a positive number' });
    }
    if (!['FIXED', 'PERCENTAGE'].includes(discountType)) {
      return res.status(400).json({ success: false, message: 'Discount type must be FIXED or PERCENTAGE' });
    }
    if (discountType === 'PERCENTAGE') {
      const pct = Number(discountValue);
      if (pct <= 0 || pct > 100) {
        return res.status(400).json({ success: false, message: 'Percentage must be between 1 and 100' });
      }
      if (maxDiscount != null && (isNaN(maxDiscount) || Number(maxDiscount) < 0)) {
        return res.status(400).json({ success: false, message: 'Max discount must be a non-negative number' });
      }
    }
    if (discountType === 'FIXED') {
      if (Number(discountValue) <= 0) {
        return res.status(400).json({ success: false, message: 'Fixed discount value must be greater than zero' });
      }
    }

    // Validate applicability
    const validApplicability = ['POOJA', 'PRODUCTS', 'KITS', 'MARKETPLACE'];
    const appArray = Array.isArray(applicability) ? applicability : [applicability];
    const invalidApp = appArray.filter(a => !validApplicability.includes(a));
    if (invalidApp.length > 0) {
      return res.status(400).json({ success: false, message: `Invalid applicability: ${invalidApp.join(', ')}` });
    }
    if (appArray.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one applicability category is required' });
    }

    // Validate date range
    if (validFrom && expiresAt && new Date(validFrom) >= new Date(expiresAt)) {
      return res.status(400).json({ success: false, message: 'Valid from date must be before expiry date' });
    }

    // Normalize code
    const normalizedCode = code.trim().toUpperCase();

    // Check uniqueness
    const existing = await Coupon.findOne({ code: normalizedCode });
    if (existing) return res.status(409).json({ success: false, message: 'Coupon code already exists' });

    const coupon = await Coupon.create({
      code: normalizedCode,
      discountType,
      discountValue: Number(discountValue),
      minCartValue: Number(minCartValue),
      maxDiscount: maxDiscount != null ? Number(maxDiscount) : null,
      validFrom: validFrom ? new Date(validFrom) : new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      usageLimit: usageLimit != null ? Number(usageLimit) : null,
      perUserLimit: perUserLimit != null ? Number(perUserLimit) : null,
      applicability: appArray,
      isActive: true,
      usageCount: 0,
      createdBy: req.user._id,
    });

    audit(req, {
      module: 'coupon', action: 'create_coupon',
      targetType: 'coupon', targetId: coupon._id, targetName: coupon.code,
      newValues: { code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue, applicability: coupon.applicability },
      severity: 'info',
    }).catch(() => {});

    res.status(201).json({ success: true, coupon });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Coupon code already exists' });
    }
    next(err);
  }
};

// ── Update coupon ───────────────────────────────────────────────────────────
exports.updateCoupon = async (req, res, next) => {
  try {
    const { id } = req.params;
    const coupon = await Coupon.findById(id);
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });

    const oldValues = {
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      minCartValue: coupon.minCartValue,
      maxDiscount: coupon.maxDiscount,
      applicability: [...coupon.applicability],
      isActive: coupon.isActive,
    };

    const allowed = [
      'discountType', 'discountValue', 'minCartValue', 'maxDiscount',
      'expiresAt', 'usageLimit', 'perUserLimit',
      'applicability', 'isActive',
    ];

    const update = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === 'expiresAt') {
          update[field] = req.body[field] ? new Date(req.body[field]) : null;
        } else if (field === 'applicability') {
          const val = Array.isArray(req.body[field]) ? req.body[field] : [req.body[field]];
          const validApplicability = ['POOJA', 'PRODUCTS', 'KITS', 'MARKETPLACE'];
          const invalidApp = val.filter(a => !validApplicability.includes(a));
          if (invalidApp.length > 0) {
            throw Object.assign(new Error(`Invalid applicability: ${invalidApp.join(', ')}`), { status: 400 });
          }
          if (val.length === 0) {
            throw Object.assign(new Error('At least one applicability category is required'), { status: 400 });
          }
          update[field] = val;
        } else if (field === 'discountType') {
          if (!['FIXED', 'PERCENTAGE'].includes(req.body[field])) {
            throw Object.assign(new Error('Discount type must be FIXED or PERCENTAGE'), { status: 400 });
          }
          update[field] = req.body[field];
        } else if (['discountValue', 'minCartValue', 'maxDiscount', 'usageLimit', 'perUserLimit'].includes(field)) {
          update[field] = req.body[field] != null ? Number(req.body[field]) : null;
        } else if (field === 'isActive') {
          update[field] = req.body[field] === true || req.body[field] === 'true';
        } else {
          update[field] = req.body[field];
        }
      }
    });

    // Validate percentage constraints after update
    const finalType = update.discountType || coupon.discountType;
    const finalValue = update.discountValue != null ? update.discountValue : coupon.discountValue;
    const finalMaxDiscount = update.maxDiscount !== undefined ? update.maxDiscount : coupon.maxDiscount;

    if (finalType === 'PERCENTAGE') {
      if (finalValue <= 0 || finalValue > 100) {
        return res.status(400).json({ success: false, message: 'Percentage must be between 1 and 100' });
      }
      if (finalMaxDiscount != null && finalMaxDiscount < 0) {
        return res.status(400).json({ success: false, message: 'Max discount must be non-negative' });
      }
    }
    if (finalType === 'FIXED' && finalValue <= 0) {
      return res.status(400).json({ success: false, message: 'Fixed discount value must be greater than zero' });
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }

    Object.assign(coupon, update);
    await coupon.save();

    const newValues = {
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      minCartValue: coupon.minCartValue,
      maxDiscount: coupon.maxDiscount,
      applicability: coupon.applicability,
      isActive: coupon.isActive,
    };

    audit(req, {
      module: 'coupon', action: 'update_coupon',
      targetType: 'coupon', targetId: coupon._id, targetName: coupon.code,
      oldValues, newValues,
      severity: 'info',
    }).catch(() => {});

    res.json({ success: true, coupon });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next(err);
  }
};

// ── Toggle coupon active status ─────────────────────────────────────────────
exports.toggleCoupon = async (req, res, next) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });

    const wasActive = coupon.isActive;
    coupon.isActive = !coupon.isActive;
    await coupon.save();

    audit(req, {
      module: 'coupon', action: coupon.isActive ? 'activate_coupon' : 'deactivate_coupon',
      targetType: 'coupon', targetId: coupon._id, targetName: coupon.code,
      oldValues: { isActive: wasActive }, newValues: { isActive: coupon.isActive },
      severity: 'info',
    }).catch(() => {});

    res.json({
      success: true,
      message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'}`,
      coupon,
    });
  } catch (err) {
    next(err);
  }
};

// ── Delete coupon ───────────────────────────────────────────────────────────
exports.deleteCoupon = async (req, res, next) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });

    // Check if coupon has been redeemed
    const redemptionCount = await CouponRedemption.countDocuments({ couponId: coupon._id });
    if (redemptionCount > 0) {
      // Soft-delete: deactivate instead of removing
      coupon.isActive = false;
      await coupon.save();

      audit(req, {
        module: 'coupon', action: 'deactivate_coupon',
        targetType: 'coupon', targetId: coupon._id, targetName: coupon.code,
        oldValues: { isActive: true }, newValues: { isActive: false },
        note: `Soft-deleted (${redemptionCount} existing redemptions preserved)`,
        severity: 'warning',
      }).catch(() => {});

      return res.json({
        success: true,
        message: `Coupon deactivated (${redemptionCount} existing redemptions preserved)`,
        coupon,
      });
    }

    await Coupon.findByIdAndDelete(req.params.id);

    audit(req, {
      module: 'coupon', action: 'delete_coupon',
      targetType: 'coupon', targetId: coupon._id, targetName: coupon.code,
      severity: 'critical',
    }).catch(() => {});

    res.json({ success: true, message: 'Coupon deleted' });
  } catch (err) {
    next(err);
  }
};

// ── List redemptions for a coupon ───────────────────────────────────────────
exports.listRedemptions = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { id } = req.params;

    const coupon = await Coupon.findById(id).lean();
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });

    const filter = { couponId: id };
    const total = await CouponRedemption.countDocuments(filter);
    const redemptions = await CouponRedemption.find(filter)
      .populate('userId', 'name email phone')
      .populate('bookingId', 'bookingNumber scheduledDate grandTotal')
      .populate('orderId', 'orderNumber totalAmount')
      .sort({ redeemedAt: -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit)
      .lean();

    res.json({
      success: true,
      coupon: { code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue },
      redemptions,
      total,
      page: +page,
      totalPages: Math.ceil(total / +limit),
    });
  } catch (err) {
    next(err);
  }
};
