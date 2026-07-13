const User                 = require('../models/User');
const Pandit               = require('../models/Pandit');
const Booking              = require('../models/Booking');
const Referral             = require('../models/Referral');
const PayoutBatch          = require('../models/PayoutBatch');
const Order                = require('../models/Order');
const Shipment             = require('../models/Shipment');
const Product              = require('../models/Product');
const Notification         = require('../models/Notification');
const AdminAuditLog        = require('../models/AdminAuditLog');
const Pooja                = require('../models/Pooja');
const EducationMaster      = require('../models/EducationMaster');
const SpecializationMaster = require('../models/SpecializationMaster');
const { audit }            = require('../services/auditService');
const {
  COURIER_PROVIDERS,
  LOCAL_DELIVERY_PARTNERS,
  TEKIPOST_STATUS_MAP,
  SHIPMENT_STATUS_LABELS,
  SHIPMENT_TO_ORDER_STATUS,
} = require('../config/shipping.config');
const { createNotification } = require('../utils/notificationService');
const { NotificationEngine } = require('../../notification-engine');
const { restoreStock }             = require('../utils/inventoryUtils');
const { calculateRefundBreakdown, validateRefundAmount } = require('../utils/refundEngine');
const { roundToPaise } = require('../utils/financeUtils');
const {
  normalizeBookingPayload,
  normalizeOrderPayload,
  normalizePanditPayload,
  normalizePoojaRequestPayload,
  normalizeUserPayload,
} = require('../../notification-engine/variables/PayloadNormalizer');
const { getRequiredVariables } = require('../../notification-engine/variables/VariableSchemas');
const WhatsAppProvider = require('../../notification-engine/providers/WhatsAppProvider');
const OtpService = require('../../notification-engine/otp/OtpService');

const BOOKING_STATUS_LABEL = {
  pending_payment:      'Pending Payment',
  paid:                 'New Booking',
  pandit_assigned:      'Pandit Assigned',
  pandit_accepted:      'Pandit Accepted',
  pending_reassignment: 'Needs Reassignment',
  completion_requested: 'Completion Pending',
  completed:            'Completed',
  cancelled:            'Cancelled',
  refunded:             'Refunded',
};

// ─── Activity Feed Helper ─────────────────────────────────────
const BOOKING_AUDIT_META = {
  status_changed_to_cancelled: { title: 'Booking Cancelled',        cat: 'bookings' },
  booking_completed_otp:       { title: 'Booking Completed',        cat: 'bookings' },
  otp_verified_completion:     { title: 'Completion OTP Verified',  cat: 'bookings' },
  completion_otp_generated:    { title: 'Completion OTP Generated', cat: 'bookings' },
  pandit_assigned:             { title: 'Pandit Assigned',          cat: 'bookings' },
  completion_approved:         { title: 'Completion Approved',      cat: 'bookings' },
  completion_rejected:         { title: 'Completion Rejected',      cat: 'bookings' },
  payout_assigned:             { title: 'Payout Assigned',          cat: 'payments' },
  payout_completed:            { title: 'Payout Completed',         cat: 'payments' },
  kit_tackipost_shipped:       { title: 'Kit Shipped via TekiPost', cat: 'shipping' },
  kit_delivery_updated:        { title: 'Kit Delivery Updated',     cat: 'shipping' },
  delivery_otp_verified:       { title: 'Delivery OTP Verified',    cat: 'shipping' },
};

const ORDER_STATUS_META = {
  paid:             { title: 'Order Placed',      cat: 'orders'   },
  confirmed:        { title: 'Order Confirmed',   cat: 'orders'   },
  packed:           { title: 'Order Packed',      cat: 'orders'   },
  shipped:          { title: 'Order Shipped',     cat: 'shipping' },
  out_for_delivery: { title: 'Out for Delivery',  cat: 'shipping' },
  delivered:        { title: 'Order Delivered',   cat: 'orders'   },
  cancelled:        { title: 'Order Cancelled',   cat: 'orders'   },
  refunded:         { title: 'Order Refunded',    cat: 'payments' },
};

const SHIP_STATUS_META = {
  pending_courier_selection: { title: 'Couriers Requested'  },
  created:                   { title: 'AWB Generated'        },
  picked_up:                 { title: 'Shipment Picked Up'   },
  in_transit:                { title: 'In Transit'           },
  out_for_delivery:          { title: 'Out for Delivery'     },
  delivered:                 { title: 'Delivered'            },
  failed_delivery:           { title: 'Delivery Failed'      },
  cancelled:                 { title: 'Shipment Cancelled'   },
  returned:                  { title: 'Return Initiated'     },
};

const REFERRAL_STATUS_META = {
  CREATED:          { title: 'Referral Created'          },
  SENT:             { title: 'Referral Sent'              },
  OPENED:           { title: 'Referral Link Opened'       },
  BOOKED:           { title: 'Referral Booking Made'      },
  PENDING_REMARK:   { title: 'Awaiting Pandit Remark'     },
  REMARK_SUBMITTED: { title: 'Pandit Remark Submitted'    },
  ADMIN_REVIEW:     { title: 'Referral in Admin Review'   },
  ASSIGNED:         { title: 'Referral Assigned'          },
  COMPLETED:        { title: 'Referral Completed'         },
  SETTLED:          { title: 'Referral Settled'           },
};

const ADMIN_ACTION_META = {
  delete_pandit:         { title: 'Pandit Deleted',          nav: 'pandits'  },
  admin_delete_user:     { title: 'User Deleted',            nav: 'users'    },
  admin_cancel_deletion: { title: 'Deletion Cancelled',      nav: 'users'    },
  pandit_assigned:       { title: 'Pandit Assigned',         nav: 'bookings' },
  completion_approved:   { title: 'Completion Approved',     nav: 'bookings' },
  completion_rejected:   { title: 'Completion Rejected',     nav: 'bookings' },
  payout_assigned:       { title: 'Payout Assigned',         nav: 'payouts'  },
  payout_completed:      { title: 'Payout Completed',        nav: 'payouts'  },
  kit_tackipost_shipped: { title: 'Kit Shipped via TekiPost', nav: 'bookings'},
  kit_delivery_updated:  { title: 'Kit Delivery Updated',    nav: 'bookings' },
};

async function _buildActivityFeed(limit = 30, category = 'all') {
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // last 60 days
  const want  = (cat) => category === 'all' || category === cat;
  const events = [];

  // ── Bookings ──────────────────────────────────────────────────
  if (want('bookings') || want('payments') || want('shipping')) {
    const bookings = await Booking.find({
      status: { $ne: 'pending_payment' },
      updatedAt: { $gte: since },
    })
      .populate('userId', 'name phone')
      .populate('poojaId', 'name')
      .sort({ updatedAt: -1 })
      .limit(25)
      .lean();

    for (const b of bookings) {
      const userName  = b.userId?.name || 'Guest';
      const poojaName = b.poojaId?.name || 'Pooja';
      const bNum      = b.bookingNumber || b._id;

      // Audit log entries (last 3 per booking)
      if (b.auditLog && b.auditLog.length > 0) {
        for (const audit of b.auditLog.slice(-3)) {
          const meta = BOOKING_AUDIT_META[audit.action];
          if (!meta || !want(meta.cat)) continue;
          events.push({
            id: `audit-${b._id}-${audit.action}-${new Date(audit.at).getTime()}`,
            category:     meta.cat,
            type:         audit.action,
            title:        meta.title,
            description:  `${poojaName} · ${userName}`,
            entityNumber: bNum,
            entityId:     b._id.toString(),
            relatedName:  userName,
            timestamp:    new Date(audit.at),
            navigateTo:   'bookings',
          });
        }
      }

      // Payment received event (booking creation)
      if (want('payments')) {
        events.push({
          id:           `booking-paid-${b._id}`,
          category:     'payments',
          type:         'booking_paid',
          title:        'Payment Received',
          description:  `${poojaName} · ₹${(b.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
          entityNumber: bNum,
          entityId:     b._id.toString(),
          relatedName:  userName,
          timestamp:    new Date(b.createdAt),
          navigateTo:   'bookings',
        });
      }
    }
  }

  // ── Marketplace Orders ────────────────────────────────────────
  if (want('orders') || want('payments') || want('shipping')) {
    const orders = await Order.find({
      status: { $ne: 'pending_payment' },
      updatedAt: { $gte: since },
    })
      .populate('userId', 'name phone')
      .sort({ updatedAt: -1 })
      .limit(15)
      .lean();

    for (const o of orders) {
      const userName = o.userId?.name || 'Guest';
      const oNum     = o.orderNumber || o._id;
      const lastTl   = o.statusTimeline && o.statusTimeline.length > 0
        ? o.statusTimeline[o.statusTimeline.length - 1] : null;
      const evStatus = lastTl ? lastTl.status : o.status;
      const evTime   = lastTl ? lastTl.timestamp : o.updatedAt;
      const meta     = ORDER_STATUS_META[evStatus];
      if (!meta || !want(meta.cat)) continue;
      events.push({
        id:           `order-${o._id}-${evStatus}`,
        category:     meta.cat,
        type:         `order_${evStatus}`,
        title:        meta.title,
        description:  `Order #${oNum} · ${userName}`,
        entityNumber: String(oNum),
        entityId:     o._id.toString(),
        relatedName:  userName,
        timestamp:    new Date(evTime),
        navigateTo:   'orders',
      });
    }
  }

  // ── Shipments ─────────────────────────────────────────────────
  if (want('shipping')) {
    const shipments = await Shipment.find({ updatedAt: { $gte: since } })
      .populate({ path: 'orderId', select: 'orderNumber userId', populate: { path: 'userId', select: 'name' } })
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean();

    for (const s of shipments) {
      const lastHist = s.shipmentHistory && s.shipmentHistory.length > 0
        ? s.shipmentHistory[s.shipmentHistory.length - 1] : null;
      const evStatus = lastHist ? lastHist.status : s.shipmentStatus;
      const evTime   = lastHist ? lastHist.timestamp : s.updatedAt;
      const meta     = SHIP_STATUS_META[evStatus];
      if (!meta) continue;
      const userName = s.orderId?.userId?.name || 'Guest';
      const oNum     = s.orderId?.orderNumber || '';
      events.push({
        id:           `shipment-${s._id}-${evStatus}`,
        category:     'shipping',
        type:         `shipment_${evStatus}`,
        title:        meta.title,
        description:  `Order #${oNum} · ${s.courierName || s.shippingMethod || 'courier'}`,
        entityNumber: s.awbNumber || String(oNum),
        entityId:     s.orderId?._id?.toString() || s._id.toString(),
        relatedName:  userName,
        timestamp:    new Date(evTime),
        navigateTo:   'orders',
      });
    }
  }

  // ── New Users ─────────────────────────────────────────────────
  if (want('users')) {
    const users = await User.find({ role: 'user', createdAt: { $gte: since } })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    for (const u of users) {
      events.push({
        id:           `user-${u._id}`,
        category:     'users',
        type:         'user_registered',
        title:        'New User Registered',
        description:  u.phone || u.email || '',
        entityNumber: '',
        entityId:     u._id.toString(),
        relatedName:  u.name || 'Unknown',
        timestamp:    new Date(u.createdAt),
        navigateTo:   'users',
      });
    }
  }

  // ── Pandits ───────────────────────────────────────────────────
  if (want('users')) {
    const pandits = await Pandit.find({ updatedAt: { $gte: since } })
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean();

    const PANDIT_STATUS_META = {
      pending:           'New Pandit Application',
      under_review:      'Pandit Under Review',
      approved:          'Pandit KYC Approved',
      rejected:          'Pandit KYC Rejected',
      suspended:         'Pandit Suspended',
      reupload_required: 'KYC Reupload Required',
    };

    for (const p of pandits) {
      events.push({
        id:           `pandit-${p._id}-${p.status}-${new Date(p.updatedAt).getTime()}`,
        category:     'users',
        type:         `pandit_${p.status}`,
        title:        PANDIT_STATUS_META[p.status] || 'Pandit Updated',
        description:  p.phone || p.email || '',
        entityNumber: p.panditId || '',
        entityId:     p._id.toString(),
        relatedName:  p.name || 'Unknown',
        timestamp:    new Date(p.updatedAt),
        navigateTo:   'pandits',
      });
    }
  }

  // ── Referrals ─────────────────────────────────────────────────
  if (want('referrals')) {
    const referrals = await Referral.find({ updatedAt: { $gte: since } })
      .populate('panditId', 'name panditId')
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean();

    for (const r of referrals) {
      const lastHist = r.statusHistory && r.statusHistory.length > 0
        ? r.statusHistory[r.statusHistory.length - 1] : null;
      const evStatus = lastHist ? lastHist.status : r.status;
      const evTime   = lastHist ? new Date(lastHist.at) : new Date(r.updatedAt);
      const meta     = REFERRAL_STATUS_META[evStatus];
      const pName    = r.panditId?.name || 'Pandit';
      events.push({
        id:           `referral-${r._id}-${evStatus}`,
        category:     'referrals',
        type:         `referral_${evStatus.toLowerCase()}`,
        title:        meta ? meta.title : 'Referral Updated',
        description:  `${pName} → ${r.userMobile || r.userEmail || 'user'}`,
        entityNumber: r.token ? r.token.slice(0, 8).toUpperCase() : '',
        entityId:     r._id.toString(),
        relatedName:  pName,
        timestamp:    evTime,
        navigateTo:   'referrals',
      });
    }
  }

  // ── Admin Audit Log ───────────────────────────────────────────
  if (want('admin')) {
    const auditLogs = await AdminAuditLog.find({ createdAt: { $gte: since } })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    for (const log of auditLogs) {
      const meta = ADMIN_ACTION_META[log.action] || { title: log.action.replace(/_/g, ' '), nav: 'dashboard' };
      events.push({
        id:           `admin-${log._id}`,
        category:     'admin',
        type:         log.action,
        title:        meta.title,
        description:  `by ${log.performedByName || 'Admin'}${log.targetName ? ` · ${log.targetName}` : ''}`,
        entityNumber: '',
        entityId:     log.targetId?.toString() || '',
        relatedName:  log.performedByName || 'Admin',
        timestamp:    new Date(log.createdAt),
        navigateTo:   meta.nav,
      });
    }
  }

  // Sort desc, dedupe, slice
  events.sort((a, b) => b.timestamp - a.timestamp);
  const seen = new Set();
  return events.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; }).slice(0, limit);
}

const PAID_BOOKING_STATUSES = ['paid', 'pandit_assigned', 'pandit_accepted', 'pending_reassignment', 'completion_requested', 'completed'];
const PAID_ORDER_STATUSES   = ['paid', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
const HIGH_VALUE_BOOKING_THRESHOLD = 10000; // ₹ — no admin-configurable setting exists for this yet

function daysAgoStart(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

// Builds a 0-filled { date: 'YYYY-MM-DD', amount|count }[] for the last `days` days
// from a Mongo $group-by-day result [{ _id: 'YYYY-MM-DD', value }].
function fillDaySeries(rows, days, key) {
  const map = new Map(rows.map((r) => [r._id, r.value]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = daysAgoStart(i);
    const dateStr = d.toISOString().split('T')[0];
    out.push({ date: dateStr, [key]: map.get(dateStr) || 0 });
  }
  return out;
}

// GET /api/admin/dashboard
exports.getDashboard = async (req, res, next) => {
  try {
    const startOfToday = daysAgoStart(0);
    const start30 = daysAgoStart(29);

    const [
      totalUsers, totalPandits, pendingPandits, totalBookings, paidBookings,
      totalOrders, pendingOrders, deliveredOrders, cancelledOrders,
    ] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      Pandit.countDocuments({ status: 'approved' }),
      Pandit.countDocuments({ status: 'pending' }),
      Booking.countDocuments(),
      Booking.countDocuments({ status: { $in: PAID_BOOKING_STATUSES } }),
      Order.countDocuments({ status: { $ne: 'pending_payment' } }),
      Order.countDocuments({ status: { $in: ['paid', 'confirmed', 'packed', 'shipped', 'out_for_delivery'] } }),
      Order.countDocuments({ status: 'delivered' }),
      Order.countDocuments({ status: 'cancelled' }),
    ]);

    const [bookingRevenue, orderRevenue, lowStockProducts] = await Promise.all([
      Booking.aggregate([
        { $match: { status: { $in: PAID_BOOKING_STATUSES } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Order.aggregate([
        { $match: { status: { $in: PAID_ORDER_STATUSES } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      Product.countDocuments({ isActive: true, stock: { $lte: 5 } }),
    ]);

    // ── Today's metrics ──────────────────────────────────────────────────
    const [
      todayBookingRevenue, todayOrderRevenue, todayBookings, todayOrders, todayNewUsers,
    ] = await Promise.all([
      Booking.aggregate([
        { $match: { status: { $in: PAID_BOOKING_STATUSES }, createdAt: { $gte: startOfToday } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Order.aggregate([
        { $match: { status: { $in: PAID_ORDER_STATUSES }, createdAt: { $gte: startOfToday } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      Booking.countDocuments({ createdAt: { $gte: startOfToday } }),
      Order.countDocuments({ createdAt: { $gte: startOfToday }, status: { $ne: 'pending_payment' } }),
      User.countDocuments({ role: 'user', createdAt: { $gte: startOfToday } }),
    ]);

    // ── Pending / needs-attention counts (feeds the Action Center) ────────
    const [
      pendingRefunds, pendingPayments, pendingBlogApprovals, pendingKyc,
      unassignedBookings, ordersAwaitingShipment, highValueBookings,
    ] = await Promise.all([
      Booking.countDocuments({ 'refund.status': 'pending' }),
      Booking.countDocuments({ paymentStatus: 'PARTIALLY_PAID' }),
      Blog.countDocuments({ status: 'pending_review' }),
      Pandit.countDocuments({ kycStatus: 'submitted' }),
      Booking.countDocuments({ status: 'paid', panditId: null }),
      Order.countDocuments({ status: { $in: ['paid', 'confirmed'] } }),
      Booking.countDocuments({ grandTotal: { $gte: HIGH_VALUE_BOOKING_THRESHOLD }, status: 'paid' }),
    ]);

    // ── 30-day trend series (7-day view is just the tail of the same data) ─
    const [bookingRevenueByDay, orderRevenueByDay, bookingsByDay, ordersByDay] = await Promise.all([
      Booking.aggregate([
        { $match: { status: { $in: PAID_BOOKING_STATUSES }, createdAt: { $gte: start30 } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, value: { $sum: '$amount' } } },
      ]),
      Order.aggregate([
        { $match: { status: { $in: PAID_ORDER_STATUSES }, createdAt: { $gte: start30 } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, value: { $sum: '$totalAmount' } } },
      ]),
      Booking.aggregate([
        { $match: { createdAt: { $gte: start30 } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, value: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: start30 }, status: { $ne: 'pending_payment' } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, value: { $sum: 1 } } },
      ]),
    ]);

    const revenueByDayMap = new Map();
    for (const row of bookingRevenueByDay) revenueByDayMap.set(row._id, (revenueByDayMap.get(row._id) || 0) + row.value);
    for (const row of orderRevenueByDay)   revenueByDayMap.set(row._id, (revenueByDayMap.get(row._id) || 0) + row.value);
    const revenueByDayRows = Array.from(revenueByDayMap, ([_id, value]) => ({ _id, value }));

    const revenue30d = fillDaySeries(revenueByDayRows, 30, 'amount');
    const revenue7d  = revenue30d.slice(-7);
    const bookings7d = fillDaySeries(bookingsByDay, 7, 'count');
    const orders7d   = fillDaySeries(ordersByDay, 7, 'count');

    // ── Top performers (last 30 days) ─────────────────────────────────────
    const [topPoojas, topProducts, topCities, topReferringPandits] = await Promise.all([
      Booking.aggregate([
        { $match: { createdAt: { $gte: start30 } } },
        { $group: { _id: '$poojaId', bookingCount: { $sum: 1 } } },
        { $sort: { bookingCount: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'poojas', localField: '_id', foreignField: '_id', as: 'pooja' } },
        { $unwind: { path: '$pooja', preserveNullAndEmptyArrays: false } },
        { $project: { poojaId: '$_id', name: '$pooja.name', bookingCount: 1, _id: 0 } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: start30 }, status: { $ne: 'pending_payment' } } },
        { $unwind: '$items' },
        { $group: { _id: '$items.productId', name: { $first: '$items.name' }, orderCount: { $sum: 1 } } },
        { $sort: { orderCount: -1 } },
        { $limit: 5 },
        { $project: { productId: '$_id', name: 1, orderCount: 1, _id: 0 } },
      ]),
      Booking.aggregate([
        { $match: { createdAt: { $gte: start30 }, 'userDetails.city': { $nin: [null, ''] } } },
        { $group: { _id: '$userDetails.city', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        { $project: { city: '$_id', count: 1, _id: 0 } },
      ]),
      Referral.aggregate([
        { $group: {
          _id: '$panditId',
          totalBooked: { $sum: { $cond: [{ $in: ['$status', ['BOOKED', 'PENDING_REMARK', 'REMARK_SUBMITTED', 'ADMIN_REVIEW', 'ASSIGNED', 'COMPLETED', 'SETTLED']] }, 1, 0] } },
        } },
        { $sort: { totalBooked: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'pandits', localField: '_id', foreignField: '_id', as: 'pandit' } },
        { $unwind: { path: '$pandit', preserveNullAndEmptyArrays: true } },
        { $project: { panditId: '$_id', name: '$pandit.name', totalBooked: 1, _id: 0 } },
      ]),
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalPandits,
        pendingPandits,
        totalBookings,
        paidBookings,
        totalRevenue: (bookingRevenue[0]?.total || 0) + (orderRevenue[0]?.total || 0),
        bookingRevenue: bookingRevenue[0]?.total || 0,
        orderRevenue:   orderRevenue[0]?.total || 0,
        totalOrders,
        pendingOrders,
        deliveredOrders,
        cancelledOrders,
        lowStockProducts,
      },
      today: {
        revenue:  (todayBookingRevenue[0]?.total || 0) + (todayOrderRevenue[0]?.total || 0),
        bookings: todayBookings,
        orders:   todayOrders,
        newUsers: todayNewUsers,
      },
      pending: {
        pandits: pendingPandits,
        refunds: pendingRefunds,
        payments: pendingPayments,
        blogApprovals: pendingBlogApprovals,
        kyc: pendingKyc,
        unassignedBookings,
        ordersAwaitingShipment,
        highValueBookings,
      },
      trends: {
        revenue7d,
        revenue30d,
        bookings7d,
        orders7d,
      },
      top: {
        poojas: topPoojas,
        products: topProducts,
        cities: topCities,
        referringPandits: topReferringPandits,
      },
      recentActivity: await _buildActivityFeed(20, 'all'),
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/activity-feed?category=all&limit=30
exports.getActivityFeed = async (req, res, next) => {
  try {
    const limit    = Math.min(parseInt(req.query.limit) || 30, 50);
    const category = req.query.category || 'all';
    const feed     = await _buildActivityFeed(limit, category);
    res.json({ success: true, activities: feed });
  } catch (err) {
    next(err);
  }
};

// ─── Pandit Management ───────────────────────────────────────

// GET /api/admin/pandits?status=pending&kycStatus=submitted
exports.getPandits = async (req, res, next) => {
  try {
    const { status, kycStatus, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status)    query.status    = status;
    if (kycStatus) query.kycStatus = kycStatus;

    // Only return pandits whose User document still exists — prevents orphan records
    // from deleted accounts appearing in the admin UI.
    const existingUserIds = await User.distinct('_id');
    query.userId = { $in: existingUserIds };

    const [pandits, total] = await Promise.all([
      Pandit.find(query)
        .populate('userId', 'name email phone createdAt')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit),
      Pandit.countDocuments(query),
    ]);

    res.json({ success: true, pandits, total });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/pandits/:id/approve
exports.approvePandit = async (req, res, next) => {
  try {
    const { status, adminNote } = req.body; // status: approved / rejected / under_review / suspended / reupload_required
    const updates = { status, adminNote };

    // When legacy-approving, also grant booking eligibility (backward compat)
    if (status === 'approved') updates.canReceiveBookings = true;
    if (status === 'rejected' || status === 'suspended') updates.canReceiveBookings = false;

    const pandit = await Pandit.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('userId', 'name email phone');

    if (!pandit) return res.status(404).json({ success: false, message: 'Pandit not found' });

    if (status === 'approved' && pandit.userId) {
      NotificationEngine.emit('PANDIT_APPROVED', normalizePanditPayload({ pandit })).catch(() => {});
    }

    res.json({ success: true, pandit });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/pandits/:id/kyc — approve / reject / request reupload
exports.updateKYCStatus = async (req, res, next) => {
  try {
    const { kycAction, reason } = req.body; // kycAction: 'approve' | 'reject' | 'reupload'

    const pandit = await Pandit.findById(req.params.id).populate('userId', 'name email phone');
    if (!pandit) return res.status(404).json({ success: false, message: 'Pandit not found' });

    const updates = { kycReviewedAt: new Date() };

    const panditPayload = normalizePanditPayload({ pandit, reason: reason?.trim() || '' });

    if (kycAction === 'approve') {
      updates.kycStatus          = 'approved';
      updates.canReceiveBookings = true;
      updates.kycRejectionReason = '';
      NotificationEngine.emit('KYC_APPROVED', panditPayload).catch(() => {});
    } else if (kycAction === 'reject') {
      if (!reason || reason.trim().length < 5) {
        return res.status(400).json({ success: false, message: 'Rejection reason is required (min 5 characters)' });
      }
      updates.kycStatus          = 'rejected';
      updates.canReceiveBookings = false;
      updates.kycRejectionReason = reason.trim();
      NotificationEngine.emit('KYC_REJECTED', panditPayload).catch(() => {});
    } else if (kycAction === 'reupload') {
      if (!reason || reason.trim().length < 5) {
        return res.status(400).json({ success: false, message: 'Re-upload reason is required (min 5 characters)' });
      }
      updates.kycStatus          = 'reupload_required';
      updates.canReceiveBookings = false;
      updates.kycRejectionReason = reason.trim();
      NotificationEngine.emit('KYC_REUPLOAD_REQUIRED', panditPayload).catch(() => {});
    } else {
      return res.status(400).json({ success: false, message: 'kycAction must be approve, reject, or reupload' });
    }

    const updated = await Pandit.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('userId', 'name email phone');
    res.json({ success: true, pandit: updated });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/pandits/:id — cascade delete pandit + user + related records
exports.deletePandit = async (req, res, next) => {
  try {
    const pandit = await Pandit.findById(req.params.id);
    if (!pandit) return res.status(404).json({ success: false, message: 'Pandit not found' });

    const { _id: panditId, userId, name, email, phone } = pandit;

    // 1. Release any pending/active booking assignments — reset to 'paid' so admin can reassign
    await Booking.updateMany(
      { panditId, status: { $in: ['pandit_assigned', 'pandit_accepted', 'pending_reassignment'] } },
      { $set: { panditId: null, status: 'paid' } }
    );

    // 2. Delete in-app notifications belonging to the pandit's user account
    if (userId) {
      await Notification.deleteMany({ userId });
    }

    // 3. Delete the Pandit document (embeds KYC, availability, coverage, all profile data)
    await Pandit.deleteOne({ _id: panditId });

    // 4. Delete the User document
    if (userId) {
      await User.deleteOne({ _id: userId });
    }

    // 5. Write audit log
    await AdminAuditLog.create({
      action:          'delete_pandit',
      performedBy:     req.user._id,
      performedByName: req.user.name || 'Admin',
      targetId:        panditId,
      targetType:      'pandit',
      targetName:      name,
      targetEmail:     email || '',
      targetPhone:     phone || '',
      note:            req.body.reason || '',
    });

    res.json({ success: true, message: `Pandit "${name}" has been permanently deleted` });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/pandits/:id — full pandit profile for admin drawer
exports.getPanditProfile = async (req, res, next) => {
  try {
    const pandit = await Pandit.findById(req.params.id)
      .populate('selectedPoojas', 'name categoryId duration image')
      .populate('poojaCharges.poojaId', 'name categoryId duration');
    if (!pandit) return res.status(404).json({ success: false, message: 'Pandit not found' });
    res.json({ success: true, pandit });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/pandits/:id/pooja-price — bulk set approved prices
// Body: { prices: [{ poojaId, approvedPrice }] }
exports.setPoojaApprovedPrice = async (req, res, next) => {
  try {
    const { prices } = req.body;
    if (!Array.isArray(prices) || prices.length === 0) {
      return res.status(400).json({ success: false, message: 'prices array is required' });
    }
    const pandit = await Pandit.findById(req.params.id);
    if (!pandit) return res.status(404).json({ success: false, message: 'Pandit not found' });

    const adminName = req.user?.name || 'Admin';
    const now = new Date();

    // Captured before mutation so the audit trail reflects expected -> approved,
    // matching the worked example: Pooja X, Expected ₹3000, Approved ₹2500.
    const auditEntries = [];

    for (const { poojaId, approvedPrice } of prices) {
      const idx = pandit.poojaCharges.findIndex(
        (c) => c.poojaId && c.poojaId.toString() === poojaId.toString()
      );
      const expectedCharges = idx >= 0 ? pandit.poojaCharges[idx].expectedCharges : 0;
      auditEntries.push({ poojaId, expectedCharges, approvedPrice });

      if (idx >= 0) {
        pandit.poojaCharges[idx].approvedPrice       = approvedPrice;
        pandit.poojaCharges[idx].priceApprovalStatus = 'approved';
        pandit.poojaCharges[idx].approvedAt          = now;
        pandit.poojaCharges[idx].approvedByName      = adminName;
      } else {
        pandit.poojaCharges.push({
          poojaId,
          expectedCharges:     0,
          approvedPrice,
          priceApprovalStatus: 'approved',
          approvedAt:          now,
          approvedByName:      adminName,
        });
      }
    }

    await pandit.save();

    const poojaNames = await Pooja.find({ _id: { $in: auditEntries.map((e) => e.poojaId) } }).select('name').lean();
    const nameById = new Map(poojaNames.map((p) => [String(p._id), p.name]));
    for (const entry of auditEntries) {
      audit(req, {
        module: 'pandit', action: 'approve_pooja_price',
        targetType: 'pandit_pooja_charge', targetId: entry.poojaId,
        targetName: `${pandit.name} — ${nameById.get(String(entry.poojaId)) || 'Pooja'}`,
        oldValues: { expectedCharges: entry.expectedCharges },
        newValues: { approvedPrice: entry.approvedPrice },
      }).catch(() => {});
    }

    res.json({ success: true, message: 'Approved prices updated', poojaCharges: pandit.poojaCharges });
  } catch (err) {
    next(err);
  }
};

// ─── User Management ─────────────────────────────────────────

// GET /api/admin/users?search=&role=&accountStatus=deletion_pending
exports.getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, role, search, accountStatus } = req.query;
    const query = {};
    if (role)          query.role          = role;
    if (accountStatus) query.accountStatus = accountStatus;
    if (search) query.$or = [
      { name:  new RegExp(search, 'i') },
      { phone: new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
    ];

    const [users, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit),
      User.countDocuments(query),
    ]);

    res.json({ success: true, users, total });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/users/:id/status
exports.updateUserStatus = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: req.body.isActive }, { new: true });
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/users/:id/cancel-deletion — admin cancels a pending deletion request
exports.adminCancelDeletion = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.accountStatus !== 'deletion_pending') {
      return res.status(400).json({ success: false, message: 'User does not have a pending deletion request' });
    }

    const updated = await User.findByIdAndUpdate(req.params.id, {
      accountStatus:         'active',
      deletionRequestedAt:   null,
      scheduledDeletionDate: null,
    }, { new: true });

    await AdminAuditLog.create({
      action:          'admin_cancel_deletion',
      performedBy:     req.user._id,
      performedByName: req.user.name || 'Admin',
      targetId:        user._id,
      targetType:      'user',
      targetName:      user.name,
      targetEmail:     user.email || '',
      targetPhone:     user.phone || '',
    });

    NotificationEngine.emit('ACCOUNT_DELETION_CANCELLED', normalizeUserPayload({ user })).catch(() => {});

    res.json({ success: true, user: updated, message: 'Deletion request cancelled' });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/users/:id — admin immediately and permanently deletes a user account
exports.adminDeleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Clean up notifications only — bookings/orders are intentionally preserved for audit/history
    await Notification.deleteMany({ userId: user._id });

    // Stamp deletedUser info onto all their bookings so admin can still identify them
    await Booking.updateMany(
      { userId: user._id },
      { $set: {
          'userDetails._deletedAt': new Date(),
          'userDetails._deletedName': user.name || '',
          'userDetails._deletedEmail': user.email || '',
          'userDetails._deletedPhone': user.phone || '',
        }
      }
    );

    // If pandit — cascade to Pandit document but keep completed booking history
    if (user.role === 'pandit') {
      const pandit = await Pandit.findOne({ userId: user._id });
      if (pandit) {
        // Release only active/pending assignments so admin can reassign
        await Booking.updateMany(
          { panditId: pandit._id, status: { $in: ['pandit_assigned', 'pandit_accepted', 'pending_reassignment'] } },
          { $set: { panditId: null, status: 'paid' } }
        );
        await Pandit.deleteOne({ _id: pandit._id });
      }
    }

    await AdminAuditLog.create({
      action:          'admin_delete_user',
      performedBy:     req.user._id,
      performedByName: req.user.name || 'Admin',
      targetId:        user._id,
      targetType:      'user',
      targetName:      user.name,
      targetEmail:     user.email || '',
      targetPhone:     user.phone || '',
      note:            req.body.reason || 'Admin-initiated immediate deletion',
    });

    await User.deleteOne({ _id: user._id });

    res.json({ success: true, message: `User "${user.name}" permanently deleted` });
  } catch (err) {
    next(err);
  }
};

// ─── Booking / Pandit Assignment ─────────────────────────────

// GET /api/admin/bookings
// GET /api/admin/bookings/:id
exports.getBookingById = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('userId',   'name phone email')
      .populate('poojaId',  'name price image')
      .populate('panditId', 'name phone profilePhoto bankDetails upiDetails')
      .populate({ path: 'kitId', select: 'name totalCost discountPrice description items', populate: { path: 'items.productId', select: 'name' } })
      .populate({ path: 'referral.referralId', select: 'status remark remarkSubmittedAt expiresAt createdAt statusHistory userMobile userEmail' })
      .populate({ path: 'referral.referringPanditId', select: 'name phone email profilePhoto city experience status' });

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    res.json({ success: true, booking });
  } catch (err) { next(err); }
};

exports.getBookings = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, withKit, referralFilter, refundStatus } = req.query;
    const query = {};
    if (status)  query.status = status;
    if (withKit === 'true') query.withKit = true;
    if (refundStatus) query['refund.status'] = refundStatus;
    // Referral filters (new Referral model — filter by presence of referralId)
    if (referralFilter === 'referred') query['referral.referralId'] = { $ne: null };
    if (referralFilter === 'normal')   query['referral.referralId'] = null;

    const bookings = await Booking.find(query)
      .populate('userId',   'name phone email')
      .populate('poojaId',  'name price image')
      .populate('panditId', 'name phone profilePhoto bankDetails upiDetails')
      .populate({ path: 'kitId', select: 'name totalCost discountPrice description items', populate: { path: 'items.productId', select: 'name' } })
      .populate({ path: 'referral.referralId', select: 'status remark remarkSubmittedAt expiresAt createdAt statusHistory userMobile userEmail' })
      .populate({ path: 'referral.referringPanditId', select: 'name phone email profilePhoto city experience status' })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    // Attach linked marketplace order for cart-checkout bookings (ZUT_CART_ prefix)
    const cartTxnIds = bookings
      .filter((b) => b.phonePeMerchantTransactionId?.startsWith('ZUT_CART_'))
      .map((b) => b.phonePeMerchantTransactionId);

    if (cartTxnIds.length > 0) {
      const linkedOrders = await Order.find({ phonePeMerchantTransactionId: { $in: cartTxnIds } })
        .populate('items.productId', 'name images price category')
        .lean();
      const orderMap = {};
      linkedOrders.forEach((o) => { orderMap[o.phonePeMerchantTransactionId] = o; });
      bookings.forEach((b) => {
        if (b.phonePeMerchantTransactionId?.startsWith('ZUT_CART_')) {
          b.linkedOrder = orderMap[b.phonePeMerchantTransactionId] || null;
        }
      });
    }

    const total = await Booking.countDocuments(query);
    res.json({ success: true, bookings, total });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/bookings/:id/payments — payment ledger entries for a booking
exports.getBookingPayments = async (req, res, next) => {
  try {
    const PaymentLedger = require('../models/PaymentLedger');
    const payments = await PaymentLedger.find({ bookingId: req.params.id })
      .sort({ createdAt: 1 })
      .lean();
    res.json({ success: true, payments });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/bookings/:id/referral-status
exports.updateReferralStatus = async (req, res, next) => {
  try {
    const VALID = ['CREATED','SENT','OPENED','BOOKED','PENDING_REMARK','REMARK_SUBMITTED','ADMIN_REVIEW','ASSIGNED','COMPLETED','SETTLED'];
    const { referralStatus, reason } = req.body;

    if (!VALID.includes(referralStatus)) {
      return res.status(400).json({ success: false, message: `Invalid referral status. Must be one of: ${VALID.join(', ')}` });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (!booking.referral?.referralId) {
      return res.status(400).json({ success: false, message: 'This booking has no linked referral' });
    }

    const referral = await Referral.findById(booking.referral.referralId);
    if (!referral) return res.status(404).json({ success: false, message: 'Referral record not found' });

    referral.status = referralStatus;
    referral.statusHistory.push({
      status: referralStatus,
      note:   reason || `Status updated to ${referralStatus} by admin`,
    });
    await referral.save();

    booking.auditLog.push({
      action:          `referral_status_${referralStatus.toLowerCase()}`,
      performedBy:     req.user._id,
      performedByName: req.user.name || 'Admin',
      note:            reason || `Referral status changed to ${referralStatus}`,
      at:              new Date(),
    });
    await booking.save();

    res.json({ success: true, booking, referral });
  } catch (err) { next(err); }
};

// GET /api/admin/bookings/:id/refund-details
exports.getRefundDetails = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('poojaId', 'name')
      .populate('refund.approvedBy', 'name');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const breakdown = calculateRefundBreakdown(booking);
    const PaymentLedger = require('../models/PaymentLedger');
    const ledger = await PaymentLedger.find({ bookingId: booking._id, paymentStatus: 'SUCCESS' })
      .sort({ createdAt: 1 }).lean();

    res.json({
      success: true,
      refundDetails: {
        bookingNumber:    booking.bookingNumber,
        poojaName:        booking.poojaId?.name || '',
        customerName:     booking.userDetails?.name || '',
        customerPhone:    booking.userDetails?.phone || '',
        grandTotal:       booking.grandTotal || booking.amount || 0,
        poojaAmount:      booking.poojaAmount  || 0,
        kitAmount:        booking.kitAmount    || 0,
        kitGST:           booking.kitGST       || 0,
        platformFee:      booking.platformFee  || 0,
        platformGST:      booking.platformGST  || 0,
        paymentStatus:    booking.paymentStatus,
        paymentMode:      booking.paymentMode,
        bookingStatus:    booking.status,
        // From engine
        amountPaid:       breakdown.amountPaid,
        nonRefundableTotal: breakdown.nonRefundableTotal,
        refundableAmount: breakdown.refundableAmount,
        policy:           breakdown.policy,
        // Stored refund record
        refund:           booking.refund,
        paymentLedger:    ledger,
      },
    });
  } catch (err) { next(err); }
};

// PATCH /api/admin/bookings/:id/refund/process  — record that admin has processed the refund
exports.processRefund = async (req, res, next) => {
  try {
    const { refundedAmount, transactionId, method, notes, refundStatus } = req.body;

    const booking = await Booking.findById(req.params.id).populate('poojaId', 'name');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    if (!['cancelled', 'refunded'].includes(booking.status)) {
      return res.status(400).json({ success: false, message: 'Refund can only be processed for cancelled or refunded bookings' });
    }

    const oldRefund = { status: booking.refund?.status || 'none', refundedAmount: booking.refund?.refundedAmount || 0 };

    // Recalculate eligible amount from engine — never trust stored or frontend values
    const refundCalc = calculateRefundBreakdown(booking);

    const parsedAmount = roundToPaise(Number(refundedAmount ?? refundCalc.refundableAmount));
    const { valid, message: validMsg } = validateRefundAmount(parsedAmount, refundCalc.refundableAmount);
    if (!valid) return res.status(400).json({ success: false, message: validMsg });

    const newStatus = refundStatus || 'processed';
    const validStatuses = ['pending', 'approved', 'rejected', 'processed', 'completed'];
    if (!validStatuses.includes(newStatus)) {
      return res.status(400).json({ success: false, message: `refundStatus must be one of: ${validStatuses.join(', ')}` });
    }

    booking.refund = {
      ...(booking.refund?.toObject?.() || booking.refund || {}),
      eligibleAmount: refundCalc.refundableAmount,
      nonRefundable:  refundCalc.nonRefundableTotal,
      refundedAmount: parsedAmount,
      status:         newStatus,
      transactionId:  transactionId || booking.refund?.transactionId || '',
      method:         method || booking.refund?.method || '',
      notes:          notes  || booking.refund?.notes  || '',
      approvedBy:     req.user._id,
      approvedByName: req.user.name || 'Admin',
      processedAt:    newStatus === 'processed' || newStatus === 'completed' ? new Date() : (booking.refund?.processedAt || null),
      approvedAt:     newStatus === 'approved'  ? new Date() : (booking.refund?.approvedAt  || null),
    };

    // Mark booking status as refunded if not already
    if (booking.status === 'cancelled' && newStatus === 'completed') {
      booking.status = 'refunded';
    }

    booking.auditLog.push({
      action:          `refund_${newStatus}`,
      performedBy:     req.user._id,
      performedByName: req.user.name || 'Admin',
      note:            `Refund ₹${parsedAmount} ${newStatus}${transactionId ? ' · Ref: ' + transactionId : ''}`,
      at:              new Date(),
    });

    await booking.save();

    audit(req, {
      module: 'payment', action: 'process_refund', severity: 'critical',
      targetType: 'booking', targetId: booking._id, targetName: booking.bookingNumber || String(booking._id),
      oldValues: oldRefund, newValues: { status: newStatus, refundedAmount: parsedAmount },
      note: transactionId ? `Ref: ${transactionId}` : notes,
    }).catch(() => {});

    // Notify customer when refund is actually processed / completed
    if (newStatus === 'processed' || newStatus === 'completed') {
      const poojaName = booking.poojaId?.name || 'Pooja';
      NotificationEngine.emit(
        'BOOKING_REFUNDED',
        normalizeBookingPayload({ booking, poojaName, refund: { amount: parsedAmount, status: newStatus } })
      ).catch(() => {});
    }

    res.json({ success: true, booking, refundBreakdown: refundCalc });
  } catch (err) { next(err); }
};

// GET /api/admin/referrals/analytics — delegate to referral controller
exports.getReferralAnalytics = require('./referral.controller').getReferralAnalytics;

// GET /api/admin/bookings/export  — server-side Excel export
exports.exportBookings = async (req, res, next) => {
  try {
    const { status, withKit, startDate, endDate } = req.query;
    const query = {};
    if (status)           query.status  = status;
    if (withKit === 'true') query.withKit = true;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate)   query.createdAt.$lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const PaymentLedger = require('../models/PaymentLedger');

    const bookings = await Booking.find(query)
      .populate('userId',   'name phone email')
      .populate('poojaId',  'name price')
      .populate('panditId', 'name phone')
      .populate({ path: 'kitId', select: 'name totalCost discountPrice description items', populate: { path: 'items.productId', select: 'name' } })
      .populate({ path: 'referral.referralId', select: 'status remark remarkSubmittedAt token createdAt expiresAt' })
      .populate({ path: 'referral.referringPanditId', select: 'name phone email' })
      .sort({ createdAt: -1 })
      .lean();

    // Build payment ledger map indexed by bookingId for O(1) lookup
    const bookingIds = bookings.map((b) => b._id);
    const ledgerEntries = await PaymentLedger.find({ bookingId: { $in: bookingIds } })
      .sort({ createdAt: 1 }).lean();
    const ledgerMap = {};
    for (const entry of ledgerEntries) {
      const key = String(entry.bookingId);
      if (!ledgerMap[key]) ledgerMap[key] = [];
      ledgerMap[key].push(entry);
    }

    // Attach linked marketplace orders
    const cartTxnIds = bookings
      .filter((b) => b.phonePeMerchantTransactionId?.startsWith('ZUT_CART_'))
      .map((b) => b.phonePeMerchantTransactionId);
    if (cartTxnIds.length > 0) {
      const linkedOrders = await Order.find({ phonePeMerchantTransactionId: { $in: cartTxnIds } })
        .populate('items.productId', 'name')
        .lean();
      const orderMap = {};
      linkedOrders.forEach((o) => { orderMap[o.phonePeMerchantTransactionId] = o; });
      bookings.forEach((b) => {
        if (b.phonePeMerchantTransactionId?.startsWith('ZUT_CART_')) {
          b.linkedOrder = orderMap[b.phonePeMerchantTransactionId] || null;
        }
      });
    }

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Zutsav Admin';
    wb.created = new Date();

    // ── Sheet 1: Bookings ──────────────────────────────────────
    const ws = wb.addWorksheet('Bookings');
    ws.columns = [
      { header: 'Booking #',            key: 'bookingNumber',   width: 16 },
      { header: 'Booked On',            key: 'bookedOn',        width: 14 },
      { header: 'Status',               key: 'status',          width: 22 },
      { header: 'Type',                 key: 'bookingType',     width: 10 },
      { header: 'Pooja',                key: 'pooja',           width: 30 },
      { header: 'Language',             key: 'language',        width: 10 },
      { header: 'Ceremony Date',        key: 'ceremonyDate',    width: 14 },
      { header: 'Ceremony Time',        key: 'ceremonyTime',    width: 12 },
      { header: 'Customer Name',        key: 'customerName',    width: 22 },
      { header: 'Customer Phone',       key: 'customerPhone',   width: 14 },
      { header: 'Customer Email',       key: 'customerEmail',   width: 28 },
      { header: 'Address',              key: 'address',         width: 32 },
      { header: 'City',                 key: 'city',            width: 14 },
      { header: 'State',                key: 'state',           width: 14 },
      { header: 'PIN',                  key: 'pin',             width: 10 },
      { header: 'Pandit Name',          key: 'panditName',      width: 22 },
      { header: 'Pandit Phone',         key: 'panditPhone',     width: 14 },
      { header: 'Payout Assigned (₹)',  key: 'payoutAssigned',  width: 16 },
      { header: 'Payout Status',        key: 'payoutStatus',    width: 14 },
      { header: 'Payout Date',          key: 'payoutDate',      width: 14 },
      { header: 'Payout Ref',           key: 'payoutRef',       width: 24 },
      { header: 'With Kit',             key: 'withKit',         width: 8  },
      { header: 'Kit Name',             key: 'kitName',         width: 24 },
      { header: 'Kit Items',            key: 'kitItems',        width: 36 },
      { header: 'Kit Delivery Status',  key: 'kitDeliveryStatus', width: 18 },
      { header: 'Tracking ID',          key: 'trackingId',      width: 22 },
      { header: 'Products',             key: 'products',        width: 45 },
      { header: 'Product Total (₹)',    key: 'productTotal',    width: 16 },
      { header: 'Pooja Amount (₹)',     key: 'poojaAmount',     width: 14 },
      { header: 'Kit Amount (₹)',       key: 'kitAmount',       width: 12 },
      { header: 'Platform Fee (₹)',     key: 'platformFee',     width: 14 },
      { header: 'Platform GST (₹)',     key: 'platformGST',     width: 14 },
      { header: 'Kit GST (₹)',          key: 'kitGST',          width: 10 },
      { header: 'Product GST (₹)',      key: 'productGST',      width: 14 },
      { header: 'Grand Total (₹)',      key: 'grandTotal',      width: 14 },
      { header: 'Payment Mode',         key: 'paymentMode',     width: 12 },
      { header: 'Payment Status',       key: 'paymentStatus',   width: 16 },
      { header: 'Paid Amount (₹)',      key: 'amountPaid',      width: 14 },
      { header: 'Pending Amount (₹)',   key: 'pendingAmount',   width: 16 },
      { header: 'Payment Method',       key: 'paymentMethod',   width: 14 },
      { header: 'Transaction ID',       key: 'transactionId',   width: 30 },
      { header: 'All Txn IDs',          key: 'allTxnIds',       width: 38 },
      { header: 'Merchant Ref',         key: 'merchantRef',     width: 36 },
      { header: 'Special Note',         key: 'specialNote',     width: 30 },
      { header: 'Referral',             key: 'referralStatus',  width: 16 },
      { header: 'Referred By Pandit',   key: 'referredByName',  width: 24 },
      { header: 'Referral Pandit Phone',key: 'referredByPhone', width: 16 },
      { header: 'Referral Pandit Email',key: 'referredByEmail', width: 28 },
      { header: 'Referral Pandit ID',   key: 'referredById',    width: 26 },
      { header: 'Referral Source',          key: 'referralSource',     width: 18 },
      // ── Pandit Review columns ──
      { header: 'Pandit Review Status',     key: 'panditReviewStatus', width: 20 },
      { header: 'Pandit Review',            key: 'panditReview',       width: 40 },
      { header: 'Pandit Reviewed By',       key: 'panditReviewedBy',   width: 20 },
      { header: 'Pandit Review Date',       key: 'panditReviewDate',   width: 16 },
      // ── Refund columns ──
      { header: 'Refund Status',        key: 'refundStatus',    width: 16 },
      { header: 'Eligible Refund (₹)',  key: 'eligibleRefund',  width: 16 },
      { header: 'Non-Refundable (₹)',   key: 'nonRefundable',   width: 16 },
      { header: 'Refunded Amount (₹)',  key: 'refundedAmount',  width: 16 },
      { header: 'Refund Txn ID',        key: 'refundTxnId',     width: 28 },
      { header: 'Refund Method',        key: 'refundMethod',    width: 16 },
      { header: 'Refund Date',          key: 'refundDate',      width: 14 },
      { header: 'Refund By',            key: 'refundBy',        width: 20 },
      { header: 'Refund Notes',         key: 'refundNotes',     width: 30 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B1F3B' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    let totalRevenue        = 0;
    let totalProductRevenue = 0;
    let totalPlatformFee    = 0;
    let totalGST            = 0;
    let totalRefunded       = 0;
    const statusCounts = {};

    for (const b of bookings) {
      const productItems  = b.linkedOrder?.items || [];
      const productTotal  = b.linkedOrder?.totalAmount || 0;
      const productGST    = productItems.reduce((s, i) => s + (i.taxAmount || 0), 0);
      const kitItems      = (b.kitId?.items || []).map((ki) => `${ki.productId?.name || 'Item'} ×${ki.quantity || 1}`).join(', ');
      const productsStr   = productItems.map((item) =>
        `${item.name || 'Product'}${item.variantLabel ? ` (${item.variantLabel})` : ''} ×${item.quantity} = ₹${item.total}`
      ).join('\n');
      const bookingAmount = b.grandTotal || b.amount || 0;
      const grandTotal    = bookingAmount + productTotal;

      totalRevenue        += grandTotal;
      totalProductRevenue += productTotal;
      totalPlatformFee    += b.platformFee || 0;
      totalGST            += (b.platformGST || 0) + (b.kitGST || 0) + productGST;
      totalRefunded       += b.refund?.refundedAmount || 0;
      statusCounts[b.status] = (statusCounts[b.status] || 0) + 1;

      // Compute eligible refund for export (use engine so cancelled bookings without stored refund still show correct value)
      const refundCalc = calculateRefundBreakdown(b);

      const row = ws.addRow({
        bookingNumber:    b.bookingNumber || String(b._id),
        bookedOn:         b.createdAt ? new Date(b.createdAt).toLocaleDateString('en-IN') : '',
        status:           BOOKING_STATUS_LABEL[b.status] || b.status,
        bookingType:      b.isUrgent ? 'Urgent' : 'Normal',
        pooja:            b.poojaId?.name || '',
        language:         b.language || '',
        ceremonyDate:     b.scheduledDate ? new Date(b.scheduledDate).toLocaleDateString('en-IN') : '',
        ceremonyTime:     b.scheduledTime || '',
        customerName:     b.userId?.name  || b.userDetails?.name  || '',
        customerPhone:    b.userId?.phone || b.userDetails?.phone || '',
        customerEmail:    b.userId?.email || b.userDetails?.email || '',
        address:          b.userDetails?.address || '',
        city:             b.userDetails?.city    || '',
        state:            b.userDetails?.state   || '',
        pin:              b.userDetails?.pincode || '',
        panditName:       b.panditId?.name  || '',
        panditPhone:      b.panditId?.phone || '',
        payoutAssigned:   b.payout?.amount  || '',
        payoutStatus:     b.payout?.status  || 'none',
        payoutDate:       b.payout?.paidAt  ? new Date(b.payout.paidAt).toLocaleDateString('en-IN') : '',
        payoutRef:        b.payout?.transactionRef || '',
        withKit:          b.withKit ? 'Yes' : 'No',
        kitName:          b.kitId?.name || '',
        kitItems:         kitItems,
        kitDeliveryStatus: b.kitDelivery?.status || '',
        trackingId:       b.kitDelivery?.trackingId || '',
        products:         productsStr,
        productTotal:     productTotal,
        poojaAmount:      b.poojaAmount  || 0,
        kitAmount:        b.kitAmount    || 0,
        platformFee:      b.platformFee  || 0,
        platformGST:      b.platformGST  || 0,
        kitGST:           b.kitGST       || 0,
        productGST:       productGST,
        grandTotal:       grandTotal,
        paymentMode:      b.paymentMode   || 'FULL',
        paymentStatus:    b.paymentStatus || (b.status === 'paid' ? 'FULLY_PAID' : 'PENDING'),
        amountPaid:       b.amountPaid    ?? (b.status === 'paid' ? (b.grandTotal || b.amount || 0) : 0),
        pendingAmount:    b.remainingAmount ?? 0,
        paymentMethod:    b.paymentProvider || 'phonepe',
        transactionId:    b.phonePeTransactionId || '',
        allTxnIds:        (ledgerMap[String(b._id)] || [])
                            .filter((e) => e.paymentStatus === 'SUCCESS')
                            .map((e) => `${e.paymentType}: ${e.phonePeTransactionId || e.merchantTransactionId} (₹${e.amount})`)
                            .join('\n') || (b.phonePeTransactionId || ''),
        merchantRef:      b.phonePeMerchantTransactionId || '',
        specialNote:      b.specialNote || '',
        referralStatus:   b.referral?.referralId ? 'Yes - Referred' : 'No Referral',
        referredByName:   b.referral?.referringPanditId?.name  || '',
        referredByPhone:  b.referral?.referringPanditId?.phone || '',
        referredByEmail:  b.referral?.referringPanditId?.email || '',
        referredById:     b.referral?.referringPanditId ? String(b.referral.referringPanditId._id || b.referral.referringPanditId) : '',
        referralSource:   b.referral?.referralId ? 'Link' : '',
        // Pandit remark (mandatory after booking via referral)
        panditReviewStatus:  b.referral?.referralId?.status || '',
        panditReview:        b.referral?.referralId?.remark || '',
        panditReviewedBy:    b.referral?.referringPanditId?.name || '',
        panditReviewDate:    b.referral?.referralId?.remarkSubmittedAt ? new Date(b.referral.referralId.remarkSubmittedAt).toLocaleDateString('en-IN') : '',
        // Refund columns
        refundStatus:     b.refund?.status || 'none',
        eligibleRefund:   refundCalc.refundableAmount,
        nonRefundable:    refundCalc.nonRefundableTotal,
        refundedAmount:   b.refund?.refundedAmount || 0,
        refundTxnId:      b.refund?.transactionId  || '',
        refundMethod:     b.refund?.method         || '',
        refundDate:       b.refund?.processedAt ? new Date(b.refund.processedAt).toLocaleDateString('en-IN') : '',
        refundBy:         b.refund?.approvedByName || '',
        refundNotes:      b.refund?.notes          || '',
      });
      row.alignment = { wrapText: true, vertical: 'top' };
    }

    // Alternate row shading
    ws.eachRow((row, rowNum) => {
      if (rowNum > 1 && rowNum % 2 === 0) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FC' } };
      }
    });

    // ── Sheet 2: Summary ───────────────────────────────────────
    const sw = wb.addWorksheet('Summary');
    sw.columns = [
      { header: 'Metric', key: 'metric', width: 34 },
      { header: 'Value',  key: 'value',  width: 22 },
    ];
    const sh = sw.getRow(1);
    sh.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    sh.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B1F3B' } };

    const summaryData = [
      ['Report Generated',       new Date().toLocaleString('en-IN')],
      ['Filter: Status',         status || 'All'],
      ['Filter: Date Range',     startDate ? `${startDate} → ${endDate || 'today'}` : 'All time'],
      ['', ''],
      ['Total Bookings',         bookings.length],
      ['Total Revenue (₹)',      totalRevenue],
      ['Booking Revenue (₹)',    totalRevenue - totalProductRevenue],
      ['Product Revenue (₹)',    totalProductRevenue],
      ['Platform Fee (₹)',       totalPlatformFee],
      ['Total GST Collected (₹)',totalGST],
      ['Total Refunded (₹)',     totalRefunded],
      ['', ''],
      ['Status Breakdown', ''],
      ...Object.entries(statusCounts).map(([s, c]) => [BOOKING_STATUS_LABEL[s] || s, c]),
    ];

    summaryData.forEach(([metric, value]) => {
      const row = sw.addRow({ metric, value });
      if (metric === 'Status Breakdown' || metric === '') {
        row.font = { bold: true };
      }
    });

    // Stream response
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="bookings_export_${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
};

// Haversine distance formula — returns km between two lat/lng points
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// GET /api/admin/pandits/available  — for assignment dropdown
exports.getAvailablePandits = async (req, res, next) => {
  try {
    const { date, userLat, userLng, userCity, userState, poojaId, bookingId } = req.query;
    const checkDate = date ? new Date(date) : new Date();
    checkDate.setHours(12, 0, 0, 0); // noon to avoid timezone edge cases
    const dayOfWeek = checkDate.getDay();

    const hasUserCoords = userLat && userLng &&
      !isNaN(parseFloat(userLat)) && !isNaN(parseFloat(userLng));
    const uLat = hasUserCoords ? parseFloat(userLat) : null;
    const uLng = hasUserCoords ? parseFloat(userLng) : null;

    // Collect pandits who already rejected this booking — exclude them from results
    // Also capture the referring pandit for referral bookings
    let excludedPanditIds   = new Set();
    let recommendedPanditId = null;
    if (bookingId) {
      const booking = await Booking.findById(bookingId).select('panditRejections referral');
      if (booking?.panditRejections?.length > 0) {
        booking.panditRejections.forEach((r) => excludedPanditIds.add(r.panditId.toString()));
      }
      if (booking?.referral?.referringPanditId) {
        recommendedPanditId = booking.referral.referringPanditId.toString();
      }
    }

    // Eligible: explicitly approved via KYC flow OR legacy-approved pandits (govtIdImage set)
    const pandits = await Pandit.find({
      status: 'approved',
      $or: [
        { canReceiveBookings: true },
        { kycStatus: 'not_submitted', govtIdImage: { $exists: true, $ne: null } },
      ],
    }).populate('userId', 'name profilePhoto');

    const available = pandits.filter((p) => {
      // 0. Exclude orphan pandits (User was deleted)
      if (!p.userId) return false;

      // 0a. Exclude pandits who previously rejected this booking
      if (excludedPanditIds.has(p._id.toString())) return false;

      // 0b. Pooja specialization filter — only show pandits who selected this pooja
      if (poojaId && p.selectedPoojas?.length > 0) {
        const hasPoojaId = p.selectedPoojas.some((id) => id.toString() === poojaId);
        if (!hasPoojaId) return false;
      } else if (poojaId && (!p.selectedPoojas || p.selectedPoojas.length === 0)) {
        return false;
      }

      // 1. Global availability toggle
      if (p.isAvailableForBookings === false) return false;

      // 2. Check leaves / blocked periods
      const isOnLeave = p.blockedPeriods.some(
        (b) => checkDate >= new Date(b.startDate) && checkDate <= new Date(b.endDate)
      );
      if (isOnLeave) return false;

      // 3. Check special dates (takes priority over weekly schedule)
      const dayStart = new Date(checkDate); dayStart.setHours(0, 0, 0, 0);
      const dayEnd   = new Date(checkDate); dayEnd.setHours(23, 59, 59, 999);
      const specialDate = p.specialDates?.find(
        (s) => new Date(s.date) >= dayStart && new Date(s.date) <= dayEnd
      );
      if (specialDate) {
        return specialDate.type === 'custom';
      }

      // 4. Check weekly schedule
      if (p.weeklySchedule?.length > 0) {
        const daySched = p.weeklySchedule.find((d) => d.dayOfWeek === dayOfWeek);
        return daySched ? daySched.enabled : false;
      }

      // 5. Fall back to legacy availabilitySlots
      return p.availabilitySlots.some((slot) => {
        if (!slot.isActive) return false;
        const inRange = checkDate >= new Date(slot.startDate) && checkDate <= new Date(slot.endDate);
        if (!inRange) return false;
        return slot.daysOfWeek.length === 0 || slot.daysOfWeek.includes(dayOfWeek);
      });
    });

    // Annotate each pandit with distance and coverage eligibility
    const annotated = available.map((p) => {
      const obj = p.toObject();
      const coverage = p.serviceCoverage || { type: 'city', radiusKm: 25 };

      let distanceKm = null;
      let withinCoverage = false; // default: out of coverage unless proven otherwise

      if (coverage.type === 'pan_india') {
        withinCoverage = true;
      } else if (coverage.type === 'state') {
        if (!p.state || !userState) {
          withinCoverage = false;
        } else {
          withinCoverage = p.state.trim().toLowerCase() === userState.trim().toLowerCase();
        }
      } else if (coverage.type === 'district') {
        const pDistrict = (p.district || p.city || '').trim().toLowerCase();
        const uDistrict = userCity.trim().toLowerCase();
        withinCoverage = !!(pDistrict && uDistrict && pDistrict === uDistrict);
      } else if (coverage.type === 'city') {
        if (!p.city || !userCity) {
          withinCoverage = false;
        } else {
          withinCoverage = p.city.trim().toLowerCase() === userCity.trim().toLowerCase();
        }
      } else if (coverage.type === 'radius') {
        if (hasUserCoords && p.latitude && p.longitude) {
          distanceKm = haversineKm(uLat, uLng, p.latitude, p.longitude);
          withinCoverage = distanceKm <= coverage.radiusKm;
        } else if (userCity && p.city) {
          // No coordinates — same city is a reasonable proxy; different city is definitely out
          withinCoverage = p.city.trim().toLowerCase() === userCity.trim().toLowerCase();
        } else {
          withinCoverage = false;
        }
      }

      // Also compute distance for display even for non-radius coverage
      if (hasUserCoords && p.latitude && p.longitude && distanceKm === null) {
        distanceKm = haversineKm(uLat, uLng, p.latitude, p.longitude);
      }

      obj.distanceKm = distanceKm !== null ? Math.round(distanceKm * 10) / 10 : null;
      obj.withinCoverage = withinCoverage;
      obj.coverageType = coverage.type;
      obj.coverageRadiusKm = coverage.radiusKm;

      // Expected charges for the requested pooja
      const chargeEntry = poojaId
        ? p.poojaCharges?.find((c) => c.poojaId?.toString() === poojaId)
        : null;
      obj.expectedChargesForPooja = chargeEntry ? chargeEntry.expectedCharges : null;

      return obj;
    });

    // Flag recommended (referring) pandit
    if (recommendedPanditId) {
      annotated.forEach((p) => { p.isRecommended = p._id.toString() === recommendedPanditId; });
    }

    // Sort: recommended first, then within-coverage, then by distance
    annotated.sort((a, b) => {
      if (a.isRecommended && !b.isRecommended) return -1;
      if (!a.isRecommended && b.isRecommended) return 1;
      if (a.withinCoverage !== b.withinCoverage) return a.withinCoverage ? -1 : 1;
      if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
      if (a.distanceKm !== null) return -1;
      if (b.distanceKm !== null) return 1;
      return 0;
    });

    res.json({ success: true, pandits: annotated, recommendedPanditId });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/pandits/search?q=   — case-insensitive partial match on name/phone/email
exports.searchPandits = async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.json({ success: true, pandits: [] });
    }
    const regex = new RegExp(q.trim(), 'i');

    const pandits = await Pandit.find({
      status: 'approved',
      $or: [{ name: regex }, { phone: regex }, { email: regex }],
    })
      .populate('userId', 'name profilePhoto')
      .limit(20)
      .lean();

    // Attach active booking count per pandit in a single aggregation
    const ids = pandits.map((p) => p._id);
    const activeCounts = await Booking.aggregate([
      {
        $match: {
          panditId: { $in: ids },
          status: { $in: ['pandit_assigned', 'pandit_accepted', 'pending_reassignment'] },
        },
      },
      { $group: { _id: '$panditId', count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(activeCounts.map((r) => [r._id.toString(), r.count]));
    pandits.forEach((p) => { p.activeBookings = countMap[p._id.toString()] || 0; });

    res.json({ success: true, pandits });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/bookings/:id/assign
exports.assignPandit = async (req, res, next) => {
  try {
    const { panditId } = req.body;

    const pandit = await Pandit.findById(panditId);
    if (!pandit || pandit.status !== 'approved') {
      return res.status(400).json({ success: false, message: 'Pandit not found or not approved' });
    }

    const booking = await Booking.findById(req.params.id).populate('poojaId', 'name');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    // Only allow assignment from valid pre-assignment states
    const assignableStatuses = ['paid', 'pending_reassignment', 'pandit_assigned'];
    if (!assignableStatuses.includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot assign a pandit to a booking with status "${booking.status}"`,
      });
    }

    // Prevent assigning a pandit who already rejected this booking
    const alreadyRejected = booking.panditRejections?.some(
      (r) => r.panditId.toString() === panditId
    );
    if (alreadyRejected) {
      return res.status(400).json({ success: false, message: 'This pandit has already rejected this booking. Please choose a different pandit.' });
    }

    const assignmentMethod = req.body.assignmentMethod === 'manual_search'
      ? 'manual_search'
      : 'nearby_recommendation';

    booking.panditId = panditId;
    booking.status = 'pandit_assigned';
    booking.panditAssignedAt = new Date();
    booking.auditLog.push({
      action:          'pandit_assigned',
      performedBy:     req.user._id,
      performedByName: req.user.name || 'Admin',
      note:            `Assigned pandit: ${pandit.name} (Method: ${assignmentMethod === 'manual_search' ? 'Manual Search' : 'Nearby Recommendation'})`,
      at:              new Date(),
    });
    await booking.save();

    // Update pandit total bookings
    await Pandit.findByIdAndUpdate(panditId, { $inc: { totalBookings: 1 } });

    const poojaNameForNotif = booking.poojaId?.name || 'Pooja';

    NotificationEngine.emit(
      'PANDIT_ASSIGNMENT_PENDING',
      normalizeBookingPayload({ booking, pandit, poojaName: poojaNameForNotif })
    ).catch(() => {});

    res.json({ success: true, booking });
  } catch (err) {
    next(err);
  }
};

// Allowed status transitions — prevents invalid state jumps
const BOOKING_TRANSITIONS = {
  pending_payment:      ['paid', 'cancelled'],
  paid:                 ['pandit_assigned', 'cancelled'],
  pandit_assigned:      ['pandit_accepted', 'pending_reassignment', 'paid', 'cancelled'],
  pandit_accepted:      ['completion_requested', 'pandit_assigned', 'cancelled'],
  pending_reassignment: ['pandit_assigned', 'cancelled'],
  completion_requested: ['completed', 'pandit_accepted', 'cancelled'],
  completed:            ['refunded', 'closed'],
  cancelled:            ['refunded', 'closed'],
  refunded:             ['closed'],
  closed:               [],
};

// PATCH /api/admin/bookings/:id/status
exports.updateBookingStatus = async (req, res, next) => {
  try {
    const { status, cancelReason, reason } = req.body;
    if (!status) return res.status(400).json({ success: false, message: 'status is required' });

    const booking = await Booking.findById(req.params.id).populate('poojaId', 'name');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const allowed = BOOKING_TRANSITIONS[booking.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot transition from "${booking.status}" to "${status}". Allowed next states: [${allowed.join(', ') || 'none — terminal state'}]`,
      });
    }

    const prevStatus = booking.status;
    const cancelNote = cancelReason || reason || '';
    const poojaName  = booking.poojaId?.name || 'Pooja';

    booking.status = status;
    if (cancelNote) booking.cancelReason = cancelNote;

    if (status === 'completed' && !booking.completedAt) {
      booking.completedAt    = new Date();
      booking.verifiedAt     = new Date();
      booking.verifiedByName = req.user.name || 'Admin';
    }

    booking.auditLog.push({
      action:          `status_changed_to_${status}`,
      performedBy:     req.user._id,
      performedByName: req.user.name || 'Admin',
      note:            `Status changed from ${prevStatus} to ${status}${cancelNote ? ': ' + cancelNote : ''}`,
      at:              new Date(),
    });
    await booking.save();

    audit(req, {
      module: 'booking', action: 'update_booking_status',
      targetType: 'booking', targetId: booking._id, targetName: booking.bookingNumber || poojaName,
      oldValues: { status: prevStatus }, newValues: { status },
      note: cancelNote,
    }).catch(() => {});

    // ── Post-transition notifications ──────────────────────────
    if (status === 'cancelled') {
      NotificationEngine.emit(
        'BOOKING_CANCELLED',
        normalizeBookingPayload({ booking, poojaName, reason: cancelNote })
      ).catch(() => {});
    }

    if (status === 'refunded') {
      const refundCalc = calculateRefundBreakdown(booking);
      if (!booking.refund || booking.refund.status === 'none') {
        booking.refund = {
          eligibleAmount: refundCalc.refundableAmount,
          nonRefundable:  refundCalc.nonRefundableTotal,
          refundedAmount: refundCalc.refundableAmount,
          status:         'processed',
          reason:         cancelNote || 'Admin-initiated refund',
          requestedAt:    booking.refund?.requestedAt || new Date(),
          processedAt:    new Date(),
          approvedBy:     req.user._id,
          approvedByName: req.user.name || 'Admin',
        };
        await booking.save();
      }

      const refundAmount = booking.refund.refundedAmount || refundCalc.refundableAmount;
      NotificationEngine.emit(
        'BOOKING_REFUNDED',
        normalizeBookingPayload({ booking, poojaName, refund: { amount: refundAmount, status: 'processed' } })
      ).catch(() => {});
    }

    if (status === 'completed') {
      const completedPayload = normalizeBookingPayload({ booking, poojaName });
      NotificationEngine.emit('INVOICE_GENERATED', completedPayload).catch(() => {});
      NotificationEngine.emit('FEEDBACK_REQUEST',  completedPayload).catch(() => {});
      NotificationEngine.emit('SERVICE_COMPLETED', completedPayload).catch(() => {});
      Booking.findByIdAndUpdate(booking._id, { invoiceSent: true }).catch(() => {});
    }

    res.json({ success: true, booking });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/bookings/:id/approve-completion
exports.approveCompletion = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.status !== 'completion_requested') {
      return res.status(400).json({ success: false, message: 'Booking is not awaiting completion approval' });
    }

    const now = new Date();
    booking.status         = 'completed';
    booking.completedAt    = now;
    booking.verifiedAt     = now;
    booking.verifiedByName = req.user.name || 'Admin';
    booking.auditLog.push({
      action:          'completion_approved',
      performedBy:     req.user._id,
      performedByName: req.user.name || 'Admin',
      at:              now,
    });

    // Auto-determine payout amount from pandit's admin-approved price
    let payoutAmount = 0;
    if (booking.panditId) {
      const pandit = await Pandit.findById(booking.panditId).select('poojaCharges');
      if (pandit) {
        const charge = pandit.poojaCharges.find(
          (c) => c.poojaId && c.poojaId.toString() === booking.poojaId.toString()
        );
        if (charge?.priceApprovalStatus === 'approved' && charge.approvedPrice != null) {
          payoutAmount = charge.approvedPrice;
        } else if (booking.panditFareAmount) {
          payoutAmount = booking.panditFareAmount;
        } else if (charge?.expectedCharges) {
          payoutAmount = charge.expectedCharges;
        }
      }
    }

    booking.payout.status = 'pending';
    if (payoutAmount > 0) {
      booking.payout.amount = payoutAmount;
    }

    await booking.save();

    const completedPoojaName = booking.poojaId?.name || 'Pooja';
    const completionPayload = normalizeBookingPayload({ booking, poojaName: completedPoojaName });
    NotificationEngine.emit('INVOICE_GENERATED', completionPayload).catch(() => {});
    NotificationEngine.emit('FEEDBACK_REQUEST',  completionPayload).catch(() => {});
    NotificationEngine.emit('SERVICE_COMPLETED', completionPayload).catch(() => {});
    Booking.findByIdAndUpdate(booking._id, { invoiceSent: true }).catch(() => {});

    res.json({ success: true, booking });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/bookings/:id/assign-payout
exports.assignPayout = async (req, res, next) => {
  try {
    const { amount, note } = req.body;
    if (!amount || isNaN(+amount) || +amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid payout amount is required' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Payout can only be assigned for completed bookings' });
    }
    if (booking.payout?.status === 'completed') {
      return res.status(400).json({ success: false, message: 'Payout already completed' });
    }

    booking.payout = {
      amount:         +amount,
      status:         'pending',
      assignedBy:     req.user._id,
      assignedByName: req.user.name || 'Admin',
    };
    booking.auditLog.push({
      action:          'payout_assigned',
      performedBy:     req.user._id,
      performedByName: req.user.name || 'Admin',
      note:            `Payout ₹${amount}${note ? ` — ${note}` : ''}`,
      at:              new Date(),
    });
    await booking.save();

    res.json({ success: true, booking });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/bookings/:id/mark-payout-paid
exports.markPayoutPaid = async (req, res, next) => {
  try {
    const { transactionRef } = req.body;

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.payout?.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'No pending payout to mark as paid' });
    }

    booking.payout.status = 'completed';
    booking.payout.paidAt = new Date();
    if (transactionRef) booking.payout.transactionRef = transactionRef;

    booking.auditLog.push({
      action:          'payout_completed',
      performedBy:     req.user._id,
      performedByName: req.user.name || 'Admin',
      note:            transactionRef ? `Ref: ${transactionRef}` : undefined,
      at:              new Date(),
    });
    await booking.save();

    res.json({ success: true, booking });
  } catch (err) {
    next(err);
  }
};

// ─── Marketplace Order Management ────────────────────────────

// GET /api/admin/orders
exports.getOrders = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;

    const query = { status: { $ne: 'pending_payment' } };
    if (status) query.status = status;
    if (search) query.$or = [{ orderNumber: new RegExp(search, 'i') }];

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('userId', 'name email phone')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit),
      Order.countDocuments(query),
    ]);

    const [totalOrders, pendingOrders, deliveredOrders, cancelledOrders, revenueAgg] = await Promise.all([
      Order.countDocuments({ status: { $ne: 'pending_payment' } }),
      Order.countDocuments({ status: { $in: ['paid', 'confirmed', 'packed', 'shipped', 'out_for_delivery'] } }),
      Order.countDocuments({ status: 'delivered' }),
      Order.countDocuments({ status: 'cancelled' }),
      Order.aggregate([
        { $match: { status: { $in: ['paid', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered'] } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
    ]);

    res.json({
      success: true, orders, total,
      stats: { totalOrders, pendingOrders, deliveredOrders, cancelledOrders, totalRevenue: revenueAgg[0]?.total || 0 },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/orders/:id
exports.getOrderById = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate('userId', 'name email phone');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/orders/:id/status
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { status, note, cancelReason } = req.body;
    const order = await Order.findById(req.params.id).populate('userId', '_id name email phone');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const prevStatus = order.status;
    order.status = status;
    order.statusTimeline = order.statusTimeline || [];
    order.statusTimeline.push({ status, timestamp: new Date(), note: note || '' });
    if (status === 'cancelled' && cancelReason) order.cancelReason = cancelReason;
    if (status === 'refunded') order.refundStatus = 'processed';
    await order.save();

    // Restore stock when cancelling a paid/in-progress order (variant-aware)
    const PAID_STATUSES = ['paid', 'confirmed', 'packed', 'processing', 'shipped', 'out_for_delivery'];
    if (status === 'cancelled' && PAID_STATUSES.includes(prevStatus)) {
      restoreStock(order.items, 'order_cancelled', order._id, req.user?.name || 'admin').catch((e) =>
        console.error('[Stock] Restore on cancel failed:', e.message)
      );
    }
    // Restore stock on refund only if cancellation didn't already do it, and payment was confirmed
    if (status === 'refunded' && prevStatus !== 'cancelled' && order.phonePeTransactionId) {
      restoreStock(order.items, 'order_refunded', order._id, req.user?.name || 'admin').catch((e) =>
        console.error('[Stock] Restore on refund failed:', e.message)
      );
    }

    const ORDER_STATUS_EVENT = {
      confirmed:        'ORDER_CONFIRMED',
      packed:           'ORDER_PACKED',
      shipped:          'ORDER_SHIPPED',
      out_for_delivery: 'ORDER_OUT_FOR_DELIVERY',
      delivered:        'ORDER_DELIVERED',
      cancelled:        'ORDER_CANCELLED',
      refunded:         'ORDER_REFUNDED',
    };
    const orderEvent = ORDER_STATUS_EVENT[status];
    if (orderEvent) {
      NotificationEngine.emit(orderEvent, normalizeOrderPayload({
        order,
        user: order.userId,
        shipment: { courierName: order.courier || '', trackingNumber: order.trackingId || '' },
        reason: cancelReason || note || '',
      })).catch(() => {});
    }

    // Auto-generate delivery OTP when status changes to out_for_delivery
    if (status === 'out_for_delivery' && prevStatus !== 'out_for_delivery') {
      _generateAndSendDeliveryOTP(order, req.user?.name).catch((e) =>
        console.error('[DeliveryOTP] Auto-generate failed:', e.message)
      );
    }

    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/orders/:id/shipment  (legacy — kept for backward compatibility)
exports.updateOrderShipment = async (req, res, next) => {
  try {
    const { trackingId, courier } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id, { $set: { trackingId, courier } }, { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
};

// ─── Shipment Management ──────────────────────────────────────

// GET /api/admin/shipping-config
exports.getShippingConfig = async (req, res) => {
  res.json({ success: true, couriers: COURIER_PROVIDERS, localPartners: LOCAL_DELIVERY_PARTNERS });
};

// GET /api/admin/orders/:id/shipment
exports.getOrderShipment = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate('userId', 'name email phone');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    const shipment = await Shipment.findOne({ orderId: req.params.id });
    res.json({ success: true, order, shipment: shipment || null });
  } catch (err) { next(err); }
};

// ─── TekiPost Single Order helpers ────────────────────────────────────────
function _validateShippingAddress(order) {
  const addr   = order.shippingAddress || {};
  const missing = [];
  const recipientName  = addr.name  || order.userId?.name  || '';
  const recipientPhone = addr.phone || order.userId?.phone || '';
  if (!recipientName)        missing.push('Customer name');
  if (!recipientPhone)       missing.push('Customer phone');
  if (!addr.address?.trim()) missing.push('Delivery address');
  if (!addr.city?.trim())    missing.push('City');
  if (!addr.state?.trim())   missing.push('State');
  if (!addr.pincode?.trim()) missing.push('Pincode');
  if (!order.totalAmount)    missing.push('Order value');
  const pinStr   = String(addr.pincode || '').replace(/\D/g, '');
  const phoneStr = String(recipientPhone).replace(/\D/g, '');
  return { missing, recipientName, recipientPhone, pinStr, phoneStr, addr };
}

// POST /api/admin/orders/:id/shipment/tekipost/init
// Step 1: create order on TekiPost and return available courier options to admin.
// A pending Shipment doc (status=pending_courier_selection) is saved so the admin
// can refresh the page and resume courier selection without losing state.
exports.initTekipostOrder = async (req, res, next) => {
  try {
    const { createSingleOrder } = require('../services/tackipost.service');

    const order = await Order.findById(req.params.id).populate('userId', 'name email phone');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // If a pending-selection shipment already exists, return its stored couriers so admin can resume
    const existing = await Shipment.findOne({ orderId: order._id });
    if (existing) {
      if (existing.shipmentStatus === 'pending_courier_selection') {
        return res.json({
          success:         true,
          resumed:         true,
          shipment:        existing,
          couriers:        existing.availableCouriers || [],
          tekipostOrderId: existing.tekipostOrderId,
        });
      }
      return res.status(400).json({ success: false, message: 'A shipment already exists for this order.' });
    }

    const { missing, recipientName, recipientPhone, pinStr, phoneStr, addr } = _validateShippingAddress(order);
    if (missing.length) {
      return res.status(400).json({ success: false, message: `Cannot create shipment — missing required fields: ${missing.join(', ')}` });
    }
    if (pinStr.length !== 6) {
      return res.status(400).json({ success: false, message: `Invalid pincode "${addr.pincode}" — must be 6 digits.` });
    }
    if (phoneStr.length < 10) {
      return res.status(400).json({ success: false, message: `Invalid phone "${recipientPhone}" — must be at least 10 digits.` });
    }

    // Accept parcel dimensions from body; fall back to computed defaults
    const totalQty       = order.items.reduce((s, it) => s + (it.quantity || 1), 0);
    const weight         = Number(req.body.weight)  || Math.min(Math.max(totalQty * 0.5, 0.5), 30);
    const length         = Number(req.body.length)  || 20;
    const width          = Number(req.body.width)   || 15;
    const height         = Number(req.body.height)  || 10;
    const isCOD          = !!req.body.isCOD;
    const codAmount      = isCOD ? Number(req.body.codAmount || order.totalAmount) : 0;
    const itemVal        = Math.round(order.totalAmount / Math.max(order.items.length, 1));

    const result = await createSingleOrder({
      bookingNumber:  order.orderNumber,
      recipientName,
      recipientPhone,
      recipientEmail: order.userId?.email || '',
      address:        addr.address,
      city:           addr.city,
      state:          addr.state,
      pincode:        addr.pincode,
      orderValue:     order.totalAmount,
      weight, length, width, height, isCOD, codAmount,
      items: order.items.map((it) => ({ name: it.name, qty: it.quantity, value: itemVal })),
    });

    if (!result.success) {
      return res.status(400).json({
        success:          false,
        message:          result.error || 'TekiPost order creation failed',
        tekipostResponse: result.tekipostResponse || null,
      });
    }

    // TekiPost auto-selected courier — create shipment immediately, no courier selection needed
    if (result.autoConfirmed) {
      const shipment = await Shipment.create({
        orderId:          order._id,
        shippingMethod:   'tekipost',
        shipmentStatus:   'created',
        awbNumber:        result.awbNumber,
        trackingNumber:   result.awbNumber,
        courierName:      result.courier,
        labelUrl:         result.labelUrl,
        freightCharges:   result.freightCharges,
        shipmentHistory:  [{ status: 'created', timestamp: new Date(), note: `Auto-confirmed by TekiPost. Courier: ${result.courier}`, updatedBy: req.user?.name || 'Admin' }],
        tekipostData:     result.tekipostResponse,
        createdBy:        req.user?.name || 'Admin',
      });
      await Order.findByIdAndUpdate(order._id, { orderStatus: 'confirmed' });
      NotificationEngine.emit('ORDER_SHIPPED', normalizeOrderPayload({
        order,
        user: order.userId,
        shipment: { courierName: result.courier, trackingNumber: result.awbNumber },
      })).catch(() => {});
      return res.status(201).json({
        success:       true,
        autoConfirmed: true,
        shipment,
        awbNumber:     result.awbNumber,
        courier:       result.courier,
        labelUrl:      result.labelUrl,
      });
    }

    // Persist pending shipment so courier selection survives a page refresh
    const shipment = await Shipment.create({
      orderId:            order._id,
      shippingMethod:     'tekipost',
      shipmentStatus:     'pending_courier_selection',
      tekipostOrderId:    result.tekipostOrderId,
      availableCouriers:  result.couriers,
      shipmentHistory:    [{ status: 'pending_courier_selection', timestamp: new Date(), note: 'TekiPost order created; awaiting courier selection', updatedBy: req.user?.name || 'Admin' }],
      tekipostData:       result.tekipostResponse,
      createdBy:          req.user?.name || 'Admin',
    });

    res.status(201).json({
      success:         true,
      shipment,
      couriers:        result.couriers,
      tekipostOrderId: result.tekipostOrderId,
    });
  } catch (err) { next(err); }
};

// POST /api/admin/orders/:id/shipment/tekipost/confirm
// Step 2: admin selects a courier; generates AWB, saves label URL.
exports.confirmTekipostOrder = async (req, res, next) => {
  try {
    const { confirmSingleOrder } = require('../services/tackipost.service');

    const { logisticsId, courierCode, courierName: selectedCourierName, freightCharge } = req.body;
    if (!logisticsId) return res.status(400).json({ success: false, message: 'logisticsId is required' });

    const order = await Order.findById(req.params.id).populate('userId', 'name email phone');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const shipment = await Shipment.findOne({ orderId: order._id });
    if (!shipment) return res.status(404).json({ success: false, message: 'No pending shipment found. Run Init first.' });
    if (shipment.shipmentStatus !== 'pending_courier_selection') {
      return res.status(400).json({ success: false, message: `Shipment is already in "${shipment.shipmentStatus}" state.` });
    }

    const result = await confirmSingleOrder({
      tekipostOrderId: shipment.tekipostOrderId,
      logisticsId:     Number(logisticsId),
    });

    if (!result.success) {
      return res.status(503).json({
        success:          false,
        message:          result.error || 'TekiPost courier confirmation failed',
        tekipostResponse: result.tekipostResponse || null,
      });
    }

    const awb = result.awbNumber || result.trackingId || '';

    shipment.shipmentStatus     = 'created';
    shipment.courierName        = result.courier       || selectedCourierName || 'TekiPost';
    shipment.trackingNumber     = awb;
    shipment.awbNumber          = awb;
    shipment.labelUrl           = result.labelUrl      || '';
    shipment.trackingUrl        = result.trackingUrl   || '';
    shipment.estimatedDelivery  = result.estimatedDelivery ? new Date(result.estimatedDelivery) : null;
    shipment.pickupDate         = result.pickupDate    ? new Date(result.pickupDate) : null;
    shipment.freightCharges     = Number(result.freightCharges || freightCharge || 0);
    shipment.selectedCourierCode = courierCode         || result.courierCode || '';
    shipment.tekipostData       = { ...((shipment.tekipostData || {})), confirm: result.tekipostResponse };
    shipment.shipmentHistory.push({
      status:    'created',
      timestamp: new Date(),
      note:      `AWB generated: ${awb} via ${shipment.courierName}`,
      updatedBy: req.user?.name || 'Admin',
    });
    await shipment.save();

    order.shipmentId     = shipment._id;
    order.trackingId     = awb;
    order.courier        = shipment.courierName;
    order.status         = 'shipped';
    order.statusTimeline = order.statusTimeline || [];
    order.statusTimeline.push({ status: 'shipped', timestamp: new Date(), note: `Shipped via TekiPost (${shipment.courierName}). AWB: ${awb}` });
    await order.save();

    NotificationEngine.emit('ORDER_SHIPPED', normalizeOrderPayload({
      order,
      user: order.userId,
      shipment: { courierName: shipment.courierName, trackingNumber: awb },
    })).catch(() => {});

    res.json({ success: true, shipment, order });
  } catch (err) { next(err); }
};

// POST /api/admin/orders/:id/shipment/tekipost/cancel-awb
// Cancel an AWB. TekiPost typically refunds freight charges to the wallet.
exports.cancelTekipostShipmentAWB = async (req, res, next) => {
  try {
    const { cancelShipment } = require('../services/tackipost.service');

    const { reason = '' } = req.body;

    const shipment = await Shipment.findOne({ orderId: req.params.id });
    if (!shipment) return res.status(404).json({ success: false, message: 'No shipment found for this order' });
    if (shipment.shippingMethod !== 'tekipost') {
      return res.status(400).json({ success: false, message: 'AWB cancellation is only for TekiPost shipments' });
    }
    if (shipment.isCancelled) {
      return res.status(400).json({ success: false, message: 'AWB is already cancelled' });
    }
    if (!shipment.awbNumber) {
      return res.status(400).json({ success: false, message: 'No AWB number found — confirm the shipment first' });
    }

    const result = await cancelShipment(shipment.awbNumber);

    if (!result.success) {
      return res.status(503).json({
        success:          false,
        message:          result.error || 'TekiPost AWB cancellation failed',
        tekipostResponse: result.tekipostResponse || null,
      });
    }

    shipment.isCancelled        = true;
    shipment.cancelledAt        = new Date();
    shipment.cancellationReason = reason;
    shipment.shipmentStatus     = 'cancelled';
    shipment.walletRefundStatus = result.refundAmount > 0 ? 'pending' : 'not_applicable';
    shipment.walletRefundAmount = result.refundAmount || 0;
    shipment.shipmentHistory.push({
      status:    'cancelled',
      timestamp: new Date(),
      note:      `AWB cancelled${reason ? ': ' + reason : ''}. Wallet refund: ₹${result.refundAmount || 0}`,
      updatedBy: req.user?.name || 'Admin',
    });
    await shipment.save();

    const order = await Order.findById(req.params.id);
    if (order) {
      order.statusTimeline = order.statusTimeline || [];
      order.statusTimeline.push({ status: 'cancelled', timestamp: new Date(), note: `TekiPost AWB cancelled${reason ? ': ' + reason : ''}` });
      await order.save();
    }

    res.json({ success: true, shipment, refundAmount: result.refundAmount || 0 });
  } catch (err) { next(err); }
};

// PATCH /api/admin/orders/:id/shipment/tekipost/wallet-refund
// Admin manually marks the TekiPost wallet refund as completed.
exports.markWalletRefundCompleted = async (req, res, next) => {
  try {
    const shipment = await Shipment.findOne({ orderId: req.params.id });
    if (!shipment) return res.status(404).json({ success: false, message: 'No shipment found' });
    if (shipment.walletRefundStatus !== 'pending') {
      return res.status(400).json({ success: false, message: 'Wallet refund is not in pending state' });
    }
    shipment.walletRefundStatus = 'refunded';
    await shipment.save();
    res.json({ success: true, shipment });
  } catch (err) { next(err); }
};

// POST /api/admin/orders/:id/shipment/manual
exports.createManualOrderShipment = async (req, res, next) => {
  try {
    const {
      manualType, courierName, trackingNumber, estimatedDelivery,
      remarks, deliveryPartner, driverName, driverPhone, vehicleNumber, expectedTime,
    } = req.body;

    if (!manualType || !['courier', 'local_delivery'].includes(manualType)) {
      return res.status(400).json({ success: false, message: 'manualType must be "courier" or "local_delivery"' });
    }

    const order = await Order.findById(req.params.id).populate('userId', 'name email phone');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const existing = await Shipment.findOne({ orderId: order._id });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Shipment already created for this order.' });
    }

    const shipment = await Shipment.create({
      orderId:           order._id,
      shippingMethod:    'manual',
      manualType,
      courierName:       manualType === 'courier'         ? (courierName    || '') : '',
      deliveryPartner:   manualType === 'local_delivery'  ? (deliveryPartner || '') : '',
      trackingNumber:    trackingNumber    || '',
      awbNumber:         trackingNumber    || '',
      driverName:        driverName        || '',
      driverPhone:       driverPhone       || '',
      vehicleNumber:     vehicleNumber     || '',
      expectedTime:      expectedTime      || '',
      estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : null,
      remarks:           remarks           || '',
      shipmentStatus:    'created',
      shipmentHistory: [{ status: 'created', timestamp: new Date(), note: 'Manual shipment created', updatedBy: req.user?.name || 'Admin' }],
      createdBy:         req.user?.name || 'Admin',
    });

    order.shipmentId  = shipment._id;
    order.trackingId  = trackingNumber || '';
    order.courier     = manualType === 'courier' ? courierName : (deliveryPartner || 'Local Delivery');
    order.status      = 'shipped';
    order.statusTimeline = order.statusTimeline || [];
    order.statusTimeline.push({ status: 'shipped', timestamp: new Date(), note: `Manual shipment — ${manualType === 'courier' ? courierName : deliveryPartner}` });
    await order.save();

    const dispName = manualType === 'courier' ? courierName : (deliveryPartner || 'Local Delivery');
    NotificationEngine.emit('ORDER_SHIPPED', normalizeOrderPayload({
      order,
      user: order.userId,
      shipment: { courierName: dispName, trackingNumber: trackingNumber || '' },
    })).catch(() => {});

    res.status(201).json({ success: true, shipment, order });
  } catch (err) { next(err); }
};

// PATCH /api/admin/orders/:id/shipment/status
exports.updateOrderShipmentStatus = async (req, res, next) => {
  try {
    const { status, note } = req.body;
    const validStatuses = ['created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed_delivery', 'cancelled', 'returned'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Valid: ${validStatuses.join(', ')}` });
    }

    const shipment = await Shipment.findOne({ orderId: req.params.id });
    if (!shipment) return res.status(404).json({ success: false, message: 'No shipment found for this order' });

    const order = await Order.findById(req.params.id).populate('userId', 'name email phone');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    shipment.shipmentStatus = status;
    shipment.shipmentHistory.push({ status, timestamp: new Date(), note: note || '', updatedBy: req.user?.name || 'Admin' });
    await shipment.save();

    // Mirror key statuses onto the order
    const mappedOrderStatus = SHIPMENT_TO_ORDER_STATUS[status];
    if (mappedOrderStatus && order.status !== mappedOrderStatus) {
      order.status = mappedOrderStatus;
      order.statusTimeline = order.statusTimeline || [];
      order.statusTimeline.push({ status: mappedOrderStatus, timestamp: new Date(), note: note || SHIPMENT_STATUS_LABELS[status] || status });
      await order.save();
    }

    const SHIPMENT_STATUS_TO_EVENT = {
      out_for_delivery: 'ORDER_OUT_FOR_DELIVERY',
      delivered:        'ORDER_DELIVERED',
      cancelled:        'ORDER_CANCELLED',
    };
    const shipmentEvent = SHIPMENT_STATUS_TO_EVENT[status];
    if (shipmentEvent) {
      NotificationEngine.emit(shipmentEvent, normalizeOrderPayload({
        order,
        user: order.userId,
        shipment: { courierName: shipment.courierName || '', trackingNumber: shipment.trackingNumber || '' },
        reason: note || '',
      })).catch(() => {});
    }

    if (status === 'out_for_delivery' && !order.deliveryOTP?.hash) {
      _generateAndSendDeliveryOTP(order, req.user?.name).catch((e) =>
        console.error('[DeliveryOTP] Auto-generate failed:', e.message)
      );
    }

    res.json({ success: true, shipment, order });
  } catch (err) { next(err); }
};

// POST /api/admin/orders/:id/shipment/sync  — re-fetch TekiPost status
exports.syncTekipostOrderStatus = async (req, res, next) => {
  try {
    const { trackShipment } = require('../services/tackipost.service');

    const shipment = await Shipment.findOne({ orderId: req.params.id });
    if (!shipment) return res.status(404).json({ success: false, message: 'No shipment found for this order' });
    if (shipment.shippingMethod !== 'tekipost') {
      return res.status(400).json({ success: false, message: 'Status sync is only available for TekiPost shipments' });
    }

    const trackingId = shipment.trackingNumber || shipment.awbNumber;
    if (!trackingId) return res.status(400).json({ success: false, message: 'No tracking number stored for this shipment' });

    const result = await trackShipment(trackingId);
    if (!result.success) {
      return res.status(503).json({ success: false, message: result.error || 'TekiPost tracking failed' });
    }

    const rawStatus     = result.status || '';
    const mappedStatus  = TEKIPOST_STATUS_MAP[rawStatus] || shipment.shipmentStatus;
    const order         = await Order.findById(req.params.id).populate('userId', 'name email phone');

    if (mappedStatus !== shipment.shipmentStatus) {
      const prevStatus = shipment.shipmentStatus;
      shipment.shipmentStatus = mappedStatus;
      shipment.shipmentHistory.push({
        status:    mappedStatus,
        timestamp: new Date(),
        note:      `TekiPost: ${rawStatus}`,
        updatedBy: 'TekiPost Sync',
      });
      if (result.deliveryDate) shipment.estimatedDelivery = new Date(result.deliveryDate);

      // Mirror to order
      const mappedOrderStatus = SHIPMENT_TO_ORDER_STATUS[mappedStatus];
      if (order && mappedOrderStatus && order.status !== mappedOrderStatus) {
        order.status = mappedOrderStatus;
        order.statusTimeline = order.statusTimeline || [];
        order.statusTimeline.push({ status: mappedOrderStatus, timestamp: new Date(), note: `TekiPost: ${rawStatus}` });
        await order.save();
      }

      const uid = order?.userId?._id || order?.userId;
      if (uid) {
        const syncPayload = normalizeOrderPayload({
          order,
          user: order.userId,
          shipment: { courierName: shipment.courierName || '', trackingNumber: shipment.trackingNumber || '' },
        });
        if (mappedStatus === 'delivered') {
          NotificationEngine.emit('ORDER_DELIVERED', syncPayload).catch(() => {});
        } else if (mappedStatus === 'out_for_delivery') {
          NotificationEngine.emit('ORDER_OUT_FOR_DELIVERY', syncPayload).catch(() => {});
        }
      }
    }

    shipment.lastSyncedAt = new Date();
    await shipment.save();

    res.json({ success: true, shipment, rawStatus, mappedStatus, events: result.events || [] });
  } catch (err) { next(err); }
};

// ─── Education Masters ────────────────────────────────────────

// GET /api/admin/education-masters
exports.getEducationMasters = async (req, res, next) => {
  try {
    const { includeInactive } = req.query;
    const query = includeInactive === 'true' ? {} : { isActive: true };
    const masters = await EducationMaster.find(query).sort({ sortOrder: 1, name: 1 });
    res.json({ success: true, masters });
  } catch (err) { next(err); }
};

// POST /api/admin/education-masters
exports.createEducationMaster = async (req, res, next) => {
  try {
    const { name, allowCustom, sortOrder } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Name is required' });
    const master = await EducationMaster.create({ name: name.trim(), allowCustom: !!allowCustom, sortOrder: sortOrder || 0 });
    res.status(201).json({ success: true, master });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'This education category already exists' });
    next(err);
  }
};

// PATCH /api/admin/education-masters/:id
exports.updateEducationMaster = async (req, res, next) => {
  try {
    const { name, isActive, allowCustom, sortOrder } = req.body;
    const updates = {};
    if (name !== undefined)        updates.name        = name.trim();
    if (isActive !== undefined)    updates.isActive    = isActive;
    if (allowCustom !== undefined) updates.allowCustom = allowCustom;
    if (sortOrder !== undefined)   updates.sortOrder   = sortOrder;
    const master = await EducationMaster.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!master) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, master });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'This education category already exists' });
    next(err);
  }
};

// DELETE /api/admin/education-masters/:id
exports.deleteEducationMaster = async (req, res, next) => {
  try {
    await EducationMaster.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true });
  } catch (err) { next(err); }
};

// ─── Specialization Masters ───────────────────────────────────

// GET /api/admin/specialization-masters
exports.getSpecializationMasters = async (req, res, next) => {
  try {
    const { includeInactive } = req.query;
    const query = includeInactive === 'true' ? {} : { isActive: true };
    const masters = await SpecializationMaster.find(query).sort({ sortOrder: 1, name: 1 });
    res.json({ success: true, masters });
  } catch (err) { next(err); }
};

// POST /api/admin/specialization-masters
exports.createSpecializationMaster = async (req, res, next) => {
  try {
    const { name, sortOrder } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Name is required' });
    const master = await SpecializationMaster.create({ name: name.trim(), sortOrder: sortOrder || 0 });
    res.status(201).json({ success: true, master });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'This specialization already exists' });
    next(err);
  }
};

// PATCH /api/admin/specialization-masters/:id
exports.updateSpecializationMaster = async (req, res, next) => {
  try {
    const { name, isActive, sortOrder } = req.body;
    const updates = {};
    if (name !== undefined)      updates.name      = name.trim();
    if (isActive !== undefined)  updates.isActive  = isActive;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    const master = await SpecializationMaster.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!master) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, master });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'This specialization already exists' });
    next(err);
  }
};

// DELETE /api/admin/specialization-masters/:id
exports.deleteSpecializationMaster = async (req, res, next) => {
  try {
    await SpecializationMaster.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true });
  } catch (err) { next(err); }
};

// ─── Payout Management ───────────────────────────────────────

// GET /api/admin/payouts/pending — all verified completed bookings with payout pending, grouped by pandit
exports.getPendingPayouts = async (req, res, next) => {
  try {
    const bookings = await Booking.find({
      status:          'completed',
      'payout.status': 'pending',
    })
      .populate('panditId', 'name phone email bankDetails upiDetails poojaCharges')
      .populate('poojaId', 'name')
      .populate('userId', 'name phone')
      .sort({ verifiedAt: -1 });

    // Auto-heal bookings where amount is 0: look up the pandit's approved price
    for (const b of bookings) {
      if ((b.payout?.amount || 0) === 0 && b.panditId && b.poojaId) {
        const charge = b.panditId.poojaCharges?.find(
          (c) => c.poojaId && c.poojaId.toString() === b.poojaId._id.toString()
        );
        let healed = 0;
        if (charge?.priceApprovalStatus === 'approved' && charge.approvedPrice > 0) {
          healed = charge.approvedPrice;
        } else if (charge?.expectedCharges > 0) {
          healed = charge.expectedCharges;
        } else if (b.panditFareAmount > 0) {
          healed = b.panditFareAmount;
        }
        if (healed > 0) {
          await Booking.findByIdAndUpdate(b._id, { 'payout.amount': healed });
          b.payout.amount = healed;
        }
      }
    }

    // Group by pandit
    const grouped = {};
    for (const b of bookings) {
      const pid = b.panditId?._id?.toString() || 'unknown';
      if (!grouped[pid]) {
        grouped[pid] = {
          pandit:      b.panditId,
          bookings:    [],
          totalAmount: 0,
        };
      }
      grouped[pid].bookings.push(b);
      grouped[pid].totalAmount += b.payout?.amount || 0;
    }

    res.json({ success: true, groups: Object.values(grouped) });
  } catch (err) { next(err); }
};

// POST /api/admin/payouts/pay-batch/:panditId — bulk pay all pending for a pandit
exports.payBatch = async (req, res, next) => {
  try {
    const { paymentMethod = 'bank_transfer', note = '' } = req.body;

    const pandit = await Pandit.findById(req.params.panditId).select('name userId phone');
    if (!pandit) return res.status(404).json({ success: false, message: 'Pandit not found' });

    const pendingBookings = await Booking.find({
      panditId:        pandit._id,
      status:          'completed',
      'payout.status': 'pending',
    });

    if (pendingBookings.length === 0) {
      return res.status(400).json({ success: false, message: 'No pending payouts for this pandit' });
    }

    const totalAmount = pendingBookings.reduce((sum, b) => sum + (b.payout?.amount || 0), 0);
    const bookingIds  = pendingBookings.map((b) => b._id);
    const now         = new Date();

    // Create payout batch
    const batch = await PayoutBatch.create({
      panditId:        pandit._id,
      bookingIds,
      totalAmount,
      paidDate:        now,
      paidByAdminId:   req.user._id,
      paidByAdminName: req.user.name || 'Admin',
      paymentMethod,
      note,
    });

    // Mark all bookings as paid
    await Booking.updateMany(
      { _id: { $in: bookingIds } },
      {
        $set: {
          'payout.status': 'completed',
          'payout.paidAt': now,
          'payout.assignedBy':     req.user._id,
          'payout.assignedByName': req.user.name || 'Admin',
          payoutBatchId: batch._id,
        },
      }
    );

    NotificationEngine.emit('PAYOUT_RELEASED', normalizePanditPayload({
      pandit, amount: totalAmount, batchId: batch.batchId, bookingCount: bookingIds.length,
    })).catch(() => {});

    res.json({ success: true, batch, bookingCount: bookingIds.length, totalAmount });
  } catch (err) { next(err); }
};

// POST /api/admin/payouts/pay-single/:bookingId — pay one booking individually
exports.paySingle = async (req, res, next) => {
  try {
    const { paymentMethod = 'bank_transfer', note = '' } = req.body;

    const booking = await Booking.findById(req.params.bookingId)
      .populate('panditId', 'name userId phone');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Booking is not completed yet' });
    }
    if (booking.payout?.status === 'completed') {
      return res.status(400).json({ success: false, message: 'Payout already processed for this booking' });
    }
    if (!booking.payout?.amount || booking.payout.amount <= 0) {
      return res.status(400).json({ success: false, message: 'No payout amount set for this booking' });
    }

    const pandit = booking.panditId;
    const amount = booking.payout.amount;
    const now    = new Date();

    // Create single-booking payout batch
    const batch = await PayoutBatch.create({
      panditId:        pandit._id,
      bookingIds:      [booking._id],
      totalAmount:     amount,
      paidDate:        now,
      paidByAdminId:   req.user._id,
      paidByAdminName: req.user.name || 'Admin',
      paymentMethod,
      note,
    });

    booking.payout.status         = 'completed';
    booking.payout.paidAt         = now;
    booking.payout.assignedBy     = req.user._id;
    booking.payout.assignedByName = req.user.name || 'Admin';
    booking.payoutBatchId         = batch._id;
    booking.auditLog.push({
      action:          'payout_completed',
      performedBy:     req.user._id,
      performedByName: req.user.name || 'Admin',
      note:            `₹${amount} via ${paymentMethod}. Batch: ${batch.batchId}`,
      at:              now,
    });
    await booking.save();

    NotificationEngine.emit('PAYOUT_RELEASED', normalizePanditPayload({
      pandit, amount, batchId: batch.batchId, bookingCount: 1,
    })).catch(() => {});

    res.json({ success: true, batch, booking });
  } catch (err) { next(err); }
};

// GET /api/admin/payouts/history — all payout batches
exports.getPayoutHistory = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, panditId, from, to } = req.query;
    const query = {};
    if (panditId) query.panditId = panditId;
    if (from || to) {
      query.paidDate = {};
      if (from) query.paidDate.$gte = new Date(from);
      if (to)   query.paidDate.$lte = new Date(new Date(to).setHours(23, 59, 59));
    }

    const [batches, total] = await Promise.all([
      PayoutBatch.find(query)
        .populate('panditId', 'name phone email')
        .populate({ path: 'bookingIds', select: 'bookingNumber poojaId payout', populate: { path: 'poojaId', select: 'name' } })
        .sort({ paidDate: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit),
      PayoutBatch.countDocuments(query),
    ]);

    const [totalPaid, pendingCount, pendingAmount] = await Promise.all([
      PayoutBatch.aggregate([{ $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
      Booking.countDocuments({ status: 'completed', 'payout.status': 'pending' }),
      Booking.aggregate([
        { $match: { status: 'completed', 'payout.status': 'pending' } },
        { $group: { _id: null, total: { $sum: '$payout.amount' } } },
      ]),
    ]);

    res.json({
      success: true,
      batches,
      total,
      stats: {
        totalPaidOut:   totalPaid[0]?.total || 0,
        pendingCount,
        pendingAmount:  pendingAmount[0]?.total || 0,
      },
    });
  } catch (err) { next(err); }
};

// PATCH /api/admin/bookings/:id/reject-completion  — admin override: reject OTP completion
exports.rejectCompletion = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.status !== 'completion_requested') {
      return res.status(400).json({ success: false, message: 'Booking is not awaiting completion approval' });
    }

    const note = reason ? `Rejected: ${reason}` : 'Admin rejected completion';
    booking.status              = 'pandit_accepted';
    booking.completionOtp       = null;
    booking.completionOtpExpiry = null;
    booking.auditLog.push({
      action:          'completion_rejected',
      performedBy:     req.user._id,
      performedByName: req.user.name || 'Admin',
      note,
    });
    await booking.save();

    await AdminAuditLog.create({
      action:          'completion_rejected',
      performedBy:     req.user._id,
      performedByName: req.user.name || 'Admin',
      targetId:        booking._id,
      targetType:      'booking',
      targetName:      booking.bookingNumber,
      note,
    });

    res.json({ success: true, booking });
  } catch (err) { next(err); }
};

// PATCH /api/admin/bookings/:id/kit-delivery  — manage kit delivery for a booking
// POST /api/admin/bookings/:id/kit-delivery/tackipost — auto-create Tackipost shipment
const { createShipment: tekipostCreateShipment } = require('../services/tackipost.service');

exports.createTackipostShipment = async (req, res, next) => {
  try {
    const createShipment = tekipostCreateShipment;
    const booking = await Booking.findById(req.params.id).populate('kitId', 'name totalCost items');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (!booking.withKit) return res.status(400).json({ success: false, message: 'Not a kit booking' });

    // Accept weight/dimensions from request body; fall back to sensible defaults
    const weight = Number(req.body.weight) || 0.5;
    const length = Number(req.body.length) || 20;
    const width  = Number(req.body.width)  || 15;
    const height = Number(req.body.height) || 10;

    const result = await createShipment({
      bookingNumber:  booking.bookingNumber,
      recipientName:  booking.userDetails?.name  || '',
      recipientPhone: booking.userDetails?.phone || '',
      recipientEmail: booking.userDetails?.email || '',
      address:        booking.userDetails?.address || '',
      city:           booking.userDetails?.city    || '',
      state:          booking.userDetails?.state   || '',
      pincode:        booking.userDetails?.pincode || '',
      orderValue:     booking.totalAmount || 500,
      weight, length, width, height,
      items: [{ name: booking.kitId?.name || 'Pooja Samagri Kit', qty: 1, value: booking.kitId?.totalCost || 500 }],
    });

    if (!result.success) {
      return res.status(503).json({ success: false, message: result.error });
    }

    booking.kitDelivery = {
      type:       'courier',
      status:     'shipped',
      trackingId: result.trackingId,
      courier:    result.courier,
      labelUrl:   result.labelUrl,
      updatedAt:  new Date(),
    };
    booking.auditLog.push({
      action: 'kit_tackipost_shipped', performedBy: req.user._id, performedByName: req.user.name || 'Admin',
      note: `Tackipost AWB: ${result.trackingId}`,
    });
    await booking.save();
    NotificationEngine.emit('KIT_SHIPPED', normalizeBookingPayload({
      booking, kit: { courier: result.courier, trackingId: result.trackingId },
    })).catch(() => {});

    res.json({ success: true, trackingId: result.trackingId, courier: result.courier, booking });
  } catch (err) { next(err); }
};

exports.updateKitDelivery = async (req, res, next) => {
  try {
    const { type, status, trackingId, courier, assignedPerson, assignedPhone, remarks } = req.body;

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (!booking.withKit) return res.status(400).json({ success: false, message: 'This booking does not have a kit' });

    const prevStatus = booking.kitDelivery?.status;
    const newStatus  = status || prevStatus || 'pending';

    booking.kitDelivery = {
      type:           type           || booking.kitDelivery?.type || 'manual',
      status:         newStatus,
      trackingId:     trackingId     !== undefined ? trackingId     : booking.kitDelivery?.trackingId,
      courier:        courier        !== undefined ? courier        : booking.kitDelivery?.courier,
      assignedPerson: assignedPerson !== undefined ? assignedPerson : booking.kitDelivery?.assignedPerson,
      assignedPhone:  assignedPhone  !== undefined ? assignedPhone  : booking.kitDelivery?.assignedPhone,
      remarks:        remarks        !== undefined ? remarks        : booking.kitDelivery?.remarks,
      updatedAt:      new Date(),
    };
    booking.auditLog.push({
      action:          'kit_delivery_updated',
      performedBy:     req.user._id,
      performedByName: req.user.name || 'Admin',
      note:            `Kit delivery status: ${newStatus}${trackingId ? `, tracking: ${trackingId}` : ''}`,
    });
    await booking.save();

    // Notify user when kit is shipped or delivered
    if (newStatus !== prevStatus) {
      if (newStatus === 'shipped') {
        NotificationEngine.emit('KIT_SHIPPED', normalizeBookingPayload({
          booking, kit: { courier: booking.kitDelivery.courier, trackingId: booking.kitDelivery.trackingId },
        })).catch(() => {});
      } else if (newStatus === 'delivered') {
        NotificationEngine.emit('KIT_DELIVERED', normalizeBookingPayload({ booking })).catch(() => {});
      }
    }

    await AdminAuditLog.create({
      action:          'kit_delivery_updated',
      performedBy:     req.user._id,
      performedByName: req.user.name || 'Admin',
      targetId:        booking._id,
      targetType:      'booking',
      targetName:      booking.bookingNumber,
    });

    res.json({ success: true, booking });
  } catch (err) { next(err); }
};

// ─── Delivery OTP ─────────────────────────────────────────────

const OTP_EXPIRY_MINUTES = 30;
const OTP_MAX_ATTEMPTS   = 5;

async function _generateAndSendDeliveryOTP(order, adminName) {
  const plain  = OtpService.generate();
  const hash   = await OtpService.hash(plain);
  const expiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  order.deliveryOTP = {
    hash,
    expiry,
    verified:    false,
    verifiedAt:  null,
    verifiedBy:  null,
    attempts:    0,
    generatedAt: new Date(),
    sentAt:      new Date(),
  };
  order.statusTimeline = order.statusTimeline || [];
  order.statusTimeline.push({ status: 'out_for_delivery', timestamp: new Date(), note: 'Delivery OTP generated and sent to customer' });
  await order.save();

  const uid  = order.userId?._id || order.userId;
  const user = await require('../models/User').findById(uid).lean();

  NotificationEngine.emit('DELIVERY_OTP_SENT', normalizeOrderPayload({
    order, user, otp: plain,
  })).catch(() => {});
}

// POST /api/admin/orders/:id/delivery-otp/generate
exports.generateDeliveryOTP = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate('userId', 'name email phone');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.status !== 'out_for_delivery') {
      return res.status(400).json({ success: false, message: 'OTP can only be generated when order status is Out for Delivery.' });
    }
    if (order.deliveryOTP?.verified) {
      return res.status(400).json({ success: false, message: 'This order has already been delivered and OTP verified.' });
    }

    await _generateAndSendDeliveryOTP(order, req.user?.name);
    res.json({ success: true, message: 'OTP generated and sent to customer via WhatsApp and email.' });
  } catch (err) { next(err); }
};

// POST /api/admin/orders/:id/delivery-otp/resend
exports.resendDeliveryOTP = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate('userId', 'name email phone');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.status === 'delivered') {
      return res.status(400).json({ success: false, message: 'Order is already delivered.' });
    }
    if (order.deliveryOTP?.verified) {
      return res.status(400).json({ success: false, message: 'OTP already verified — order is delivered.' });
    }

    await _generateAndSendDeliveryOTP(order, req.user?.name);
    res.json({ success: true, message: 'New OTP generated and sent to customer.' });
  } catch (err) { next(err); }
};

// POST /api/admin/orders/:id/delivery-otp/verify
exports.verifyDeliveryOTP = async (req, res, next) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ success: false, message: 'OTP is required.' });

    const order = await Order.findById(req.params.id).populate('userId', 'name email phone');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (['delivered', 'cancelled', 'refunded'].includes(order.status)) {
      return res.status(400).json({ success: false, message: `Cannot verify OTP — order is already ${order.status}.` });
    }
    if (!order.deliveryOTP?.hash) {
      return res.status(400).json({ success: false, message: 'No OTP generated for this order. Generate one first.' });
    }
    if (order.deliveryOTP.verified) {
      return res.status(400).json({ success: false, message: 'OTP already verified — order is delivered.' });
    }
    if (new Date() > new Date(order.deliveryOTP.expiry)) {
      return res.status(400).json({ success: false, message: 'OTP has expired. Please resend a new OTP.' });
    }
    if (OtpService.isRateLimited(order.deliveryOTP.attempts, OTP_MAX_ATTEMPTS)) {
      return res.status(429).json({ success: false, message: `Too many failed attempts. Please resend a new OTP.` });
    }

    const isValid = await OtpService.compare(String(otp).trim(), order.deliveryOTP.hash, true);

    if (!isValid) {
      order.deliveryOTP.attempts += 1;
      await order.save();
      const remaining = OTP_MAX_ATTEMPTS - order.deliveryOTP.attempts;
      return res.status(400).json({
        success: false,
        message: remaining > 0
          ? `Invalid OTP. ${remaining} attempt${remaining > 1 ? 's' : ''} remaining.`
          : 'Too many failed attempts. Please resend a new OTP.',
      });
    }

    // OTP correct — mark delivered
    const verifiedBy = req.user?.name || 'Admin';
    order.deliveryOTP.verified   = true;
    order.deliveryOTP.verifiedAt = new Date();
    order.deliveryOTP.verifiedBy = verifiedBy;
    order.status = 'delivered';
    order.statusTimeline.push({ status: 'delivered', timestamp: new Date(), note: `OTP verified by ${verifiedBy} — delivery confirmed` });
    await order.save();

    // Mirror to shipment
    const Shipment = require('../models/Shipment');
    const shipment = await Shipment.findOne({ orderId: order._id });
    if (shipment && shipment.shipmentStatus !== 'delivered') {
      shipment.shipmentStatus = 'delivered';
      shipment.shipmentHistory.push({ status: 'delivered', timestamp: new Date(), note: 'Delivery confirmed via OTP', updatedBy: verifiedBy });
      await shipment.save();
    }

    const deliveredPayload = normalizeOrderPayload({ order, user: order.userId });
    NotificationEngine.emit('ORDER_DELIVERED',     deliveredPayload).catch(() => {});
    NotificationEngine.emit('INVOICE_GENERATED',   deliveredPayload).catch(() => {});

    await AdminAuditLog.create({
      action: 'delivery_otp_verified', performedByName: verifiedBy,
      targetId: order._id, targetType: 'order', targetName: order.orderNumber,
      note: 'OTP verified. Order marked as Delivered.',
    }).catch(() => {});

    res.json({ success: true, message: 'OTP verified. Order marked as Delivered.', order });
  } catch (err) { next(err); }
};

// GET /api/admin/orders/:id/invoice
exports.getAdminOrderInvoice = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate('userId', 'name email phone');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    const Shipment = require('../models/Shipment');
    const shipment = await Shipment.findOne({ orderId: order._id }).lean();
    res.json({ success: true, order: order.toObject(), shipment: shipment || null });
  } catch (err) { next(err); }
};

// ─── Blog Administration ─────────────────────────────────────────────────────

const Blog         = require('../models/Blog');
const BlogCategory = require('../models/BlogCategory');
const BlogComment  = require('../models/BlogComment');
const BlogLike     = require('../models/BlogLike');
const BlogBookmark = require('../models/BlogBookmark');
const SystemSettings = require('../models/SystemSettings');

// GET /api/admin/blogs
exports.adminGetBlogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, authorRole, category, search } = req.query;
    const query = {};
    if (status)     query.status     = status;
    if (authorRole) query.authorRole = authorRole;
    if (category)   query.category   = category;
    if (search) query.$or = [
      { title:      new RegExp(search, 'i') },
      { authorName: new RegExp(search, 'i') },
    ];

    const [blogs, total] = await Promise.all([
      Blog.find(query)
        .populate('category', 'name slug icon color')
        .select('-content')
        .sort({ createdAt: -1 })
        .limit(+limit)
        .skip((+page - 1) * +limit)
        .lean(),
      Blog.countDocuments(query),
    ]);

    const stats = await Blog.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const statusCounts = {};
    stats.forEach((s) => { statusCounts[s._id] = s.count; });

    res.json({ success: true, blogs, total, statusCounts });
  } catch (err) { next(err); }
};

// PATCH /api/admin/blogs/:id/approve
exports.adminApproveBlog = async (req, res, next) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });

    blog.status       = 'published';
    blog.publishedAt  = blog.publishedAt || new Date();
    blog.publishedBy  = req.user._id;
    blog.reviewedAt   = new Date();
    blog.reviewerName = req.user.name || 'Admin';
    blog.rejectionReason = '';
    await blog.save();

    // In-app notification
    createNotification({
      userId:  blog.authorId,
      type:    'blog_approved',
      title:   'Blog Published!',
      message: `Your blog "${blog.title}" has been approved and published.`,
      data:    { blogId: blog._id, slug: blog.slug },
    }).catch(() => {});

    res.json({ success: true, blog, message: 'Blog approved and published.' });
  } catch (err) { next(err); }
};

// PATCH /api/admin/blogs/:id/reject
exports.adminRejectBlog = async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required (min 5 chars)' });
    }

    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });

    blog.status          = 'rejected';
    blog.rejectionReason = reason.trim();
    blog.reviewedAt      = new Date();
    blog.reviewerName    = req.user.name || 'Admin';
    await blog.save();

    createNotification({
      userId:  blog.authorId,
      type:    'blog_rejected',
      title:   'Blog Needs Revision',
      message: `Your blog "${blog.title}" was not approved. Reason: ${reason.trim()}`,
      data:    { blogId: blog._id },
    }).catch(() => {});

    res.json({ success: true, blog, message: 'Blog rejected.' });
  } catch (err) { next(err); }
};

// PATCH /api/admin/blogs/:id/feature
exports.adminFeatureBlog = async (req, res, next) => {
  try {
    const { isFeatured, isTrending, isEditorsPick, isHomepageHero } = req.body;
    const updates = {};
    if (isFeatured     !== undefined) updates.isFeatured     = isFeatured;
    if (isTrending     !== undefined) updates.isTrending     = isTrending;
    if (isEditorsPick  !== undefined) updates.isEditorsPick  = isEditorsPick;
    if (isHomepageHero !== undefined) updates.isHomepageHero = isHomepageHero;

    const blog = await Blog.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });

    if (isFeatured === true || isEditorsPick === true) {
      createNotification({
        userId:  blog.authorId,
        type:    'blog_featured',
        title:   "You're Featured! 🌟",
        message: `Your blog "${blog.title}" has been featured on Zutsav.`,
        data:    { blogId: blog._id, slug: blog.slug },
      }).catch(() => {});
    }

    res.json({ success: true, blog });
  } catch (err) { next(err); }
};

// PATCH /api/admin/blogs/:id/archive
exports.adminArchiveBlog = async (req, res, next) => {
  try {
    const blog = await Blog.findByIdAndUpdate(req.params.id, { status: 'archived' }, { new: true });
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });
    res.json({ success: true, blog });
  } catch (err) { next(err); }
};

// DELETE /api/admin/blogs/:id
exports.adminDeleteBlog = async (req, res, next) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });

    await Promise.all([
      Blog.deleteOne({ _id: blog._id }),
      BlogComment.deleteMany({ blogId: blog._id }),
      BlogLike.deleteMany({ blogId: blog._id }),
      BlogBookmark.deleteMany({ blogId: blog._id }),
    ]);

    res.json({ success: true, message: 'Blog permanently deleted.' });
  } catch (err) { next(err); }
};

// ─── Communication Center — Broadcast ────────────────────────────────────────

// POST /api/admin/broadcast
exports.sendBroadcast = async (req, res, next) => {
  try {
    const { audience, title, message } = req.body;
    if (!['user', 'pandit', 'all'].includes(audience)) {
      return res.status(400).json({ success: false, message: 'Invalid audience' });
    }
    if (!title?.trim() || !message?.trim()) {
      return res.status(400).json({ success: false, message: 'Title and message are required' });
    }

    const roleQuery = audience === 'all' ? { role: { $in: ['user', 'pandit'] } } : { role: audience };
    const recipients = await User.find(roleQuery).select('_id').lean();

    const CHUNK = 200;
    for (let i = 0; i < recipients.length; i += CHUNK) {
      await Promise.all(recipients.slice(i, i + CHUNK).map((u) =>
        createNotification({ userId: u._id, type: 'admin_broadcast', title: title.trim(), message: message.trim() })
      ));
    }

    res.json({ success: true, sentCount: recipients.length });
  } catch (err) { next(err); }
};

// ─── Global Search ────────────────────────────────────────────────────────────

// GET /api/admin/search?q=
exports.globalSearch = async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ success: true, results: {} });
    const rx = new RegExp(q, 'i');
    const [users, pandits, bookings, orders, blogs] = await Promise.all([
      User.find({ $or: [{ name: rx }, { phone: rx }, { email: rx }] }).select('name phone email role').limit(5).lean(),
      Pandit.find({ $or: [{ name: rx }, { phone: rx }, { email: rx }] }).select('name phone email status').limit(5).lean(),
      Booking.find({ $or: [{ bookingNumber: rx }, { 'userDetails.name': rx }, { 'userDetails.phone': rx }] }).select('bookingNumber status userDetails.name').limit(5).lean(),
      Order.find({ orderNumber: rx }).select('orderNumber status').limit(5).lean(),
      Blog.find({ $or: [{ title: rx }, { authorName: rx }] }).select('title status authorName').limit(5).lean(),
    ]);
    res.json({ success: true, results: { users, pandits, bookings, orders, blogs } });
  } catch (err) { next(err); }
};

// ─── System Health ────────────────────────────────────────────────────────────

// GET /api/admin/system-health
exports.getSystemHealth = async (req, res, next) => {
  try {
    const { getIntegrationStatuses } = require('../config/healthReport');
    const services = await getIntegrationStatuses();
    // Preserve the API's previous "online"/"offline" wording for the database row.
    const mapped = services.map((s) =>
      s.key === 'database' ? { ...s, status: s.status === 'connected' ? 'online' : 'offline' } : s
    );
    res.json({ success: true, services: mapped });
  } catch (err) { next(err); }
};

// ─── Blog Categories ─────────────────────────────────────────────────────────

// GET /api/admin/blog-categories
exports.getBlogCategories = async (req, res, next) => {
  try {
    const categories = await BlogCategory.find().sort({ order: 1, name: 1 }).lean();
    res.json({ success: true, categories });
  } catch (err) { next(err); }
};

// POST /api/admin/blog-categories
exports.createBlogCategory = async (req, res, next) => {
  try {
    const { name, description, icon, color, order } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });
    const cat = await BlogCategory.create({ name, description, icon, color, order });
    res.status(201).json({ success: true, category: cat });
  } catch (err) { next(err); }
};

// PATCH /api/admin/blog-categories/:id
exports.updateBlogCategory = async (req, res, next) => {
  try {
    const { name, description, icon, color, order, isActive } = req.body;
    const cat = await BlogCategory.findByIdAndUpdate(
      req.params.id, { name, description, icon, color, order, isActive }, { new: true }
    );
    if (!cat) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, category: cat });
  } catch (err) { next(err); }
};

// DELETE /api/admin/blog-categories/:id
exports.deleteBlogCategory = async (req, res, next) => {
  try {
    await BlogCategory.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Category deleted' });
  } catch (err) { next(err); }
};

// ─── Notification Mapping Management ─────────────────────────────────────────

const NotificationMapping        = require('../models/NotificationMapping');
const NotificationMappingVersion = require('../models/NotificationMappingVersion');
const NotificationLog            = require('../models/NotificationLog');
const { EVENTS, EVENT_CATEGORIES } = require('../../notification-engine');
const WhatsAppTemplate     = require('../models/WhatsAppTemplate');
const ChannelRegistry      = require('../../notification-engine/channels/ChannelRegistry');
const TemplateEngine       = require('../../notification-engine/templates/TemplateEngine');
const TemplateValidator    = require('../../notification-engine/templates/TemplateValidator');
const WhatsAppChannel      = require('../../notification-engine/channels/WhatsAppChannel');
const { resolveRecipients } = require('../../notification-engine/core/EventDispatcher');

const MAPPING_TRACKED_FIELDS = [
  'eventName', 'recipientType', 'channel',
  'whatsappTemplateName', 'whatsappLanguage', 'whatsappVariables', 'whatsappButtonType', 'whatsappButtonPayloadPath',
  'emailTemplateName', 'emailSubject', 'emailHtml',
  'inAppType', 'inAppTitle', 'inAppMessage',
  'enabled', 'priority', 'label',
];

const MAPPING_EDITABLE_FIELDS = [
  'whatsappTemplateName', 'whatsappLanguage', 'whatsappVariables', 'whatsappButtonType', 'whatsappButtonPayloadPath',
  'emailTemplateName', 'emailSubject', 'emailHtml',
  'inAppType', 'inAppTitle', 'inAppMessage',
  'enabled', 'priority', 'label',
];

function _mappingDisplay(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function _mappingSnapshot(mapping) {
  const snap = {};
  for (const key of MAPPING_TRACKED_FIELDS) snap[key] = mapping[key];
  return snap;
}

function _clientIp(req) {
  return req.ip || req.connection?.remoteAddress || '';
}

/**
 * Append-only version row for a mapping mutation. Mirrors ConfigVersion's
 * pattern (see configCenter.controller.js) — snapshot + field-level diff,
 * never a second source of truth for the live mapping.
 */
async function _recordMappingVersion(req, { mapping, before, action, note }) {
  const changedFields = [];
  for (const key of MAPPING_TRACKED_FIELDS) {
    const oldValue = _mappingDisplay(before ? before[key] : undefined);
    const newValue = _mappingDisplay(mapping[key]);
    if (oldValue !== newValue) changedFields.push({ field: key, oldValue, newValue });
  }
  if (action === 'update' && !changedFields.length) return null;

  return NotificationMappingVersion.create({
    mappingId:     mapping._id,
    eventName:     mapping.eventName,
    snapshot:      _mappingSnapshot(mapping),
    changedFields,
    updatedBy:     req.user._id,
    updatedByName: req.user.name || req.user.email || 'Admin',
    ipAddress:     _clientIp(req),
    action,
    note:          note || '',
  }).catch(() => null);
}

// GET /api/admin/notifications/events  — all registered events with metadata
exports.getNotificationEvents = async (req, res, next) => {
  try {
    const events = Object.keys(EVENTS).map((key) => ({
      name:     key,
      label:    EVENT_CATEGORIES[key]?.label    || key,
      category: EVENT_CATEGORIES[key]?.category || 'Other',
    }));
    // Group by category
    const grouped = {};
    events.forEach((e) => {
      if (!grouped[e.category]) grouped[e.category] = [];
      grouped[e.category].push(e);
    });
    res.json({ success: true, events, grouped });
  } catch (err) { next(err); }
};

// GET /api/admin/notifications/mappings?eventName=&channel=&enabled=&recipientType=&q=&page=&limit=
exports.getNotificationMappings = async (req, res, next) => {
  try {
    const { eventName, channel, enabled, recipientType, q } = req.query;
    const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));

    const query = {};
    if (eventName)     query.eventName     = eventName;
    if (channel)        query.channel       = channel;
    if (recipientType)  query.recipientType = recipientType;
    if (enabled !== undefined) query.enabled = enabled === 'true';
    if (q) {
      const rx = new RegExp(String(q).trim(), 'i');
      query.$or = [{ eventName: rx }, { label: rx }];
    }

    const [mappings, total] = await Promise.all([
      NotificationMapping.find(query)
        .sort({ eventName: 1, priority: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      NotificationMapping.countDocuments(query),
    ]);

    res.json({ success: true, mappings, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) { next(err); }
};

// POST /api/admin/notifications/mappings
exports.createNotificationMapping = async (req, res, next) => {
  try {
    const {
      eventName, recipientType, channel,
      whatsappTemplateName, whatsappLanguage, whatsappVariables, whatsappButtonType, whatsappButtonPayloadPath,
      emailTemplateName, emailSubject, emailHtml,
      inAppType, inAppTitle, inAppMessage,
      enabled, priority, label,
    } = req.body;

    if (!eventName || !recipientType || !channel) {
      return res.status(400).json({ success: false, message: 'eventName, recipientType, and channel are required' });
    }
    if (!EVENTS[eventName]) {
      return res.status(400).json({ success: false, message: `Unknown eventName "${eventName}". Check EventRegistry.` });
    }

    const mapping = await NotificationMapping.create({
      eventName, recipientType, channel,
      whatsappTemplateName: whatsappTemplateName || '',
      whatsappLanguage:     whatsappLanguage     || 'en',
      whatsappVariables:    whatsappVariables     || [],
      whatsappButtonType:        whatsappButtonType        || 'none',
      whatsappButtonPayloadPath: whatsappButtonPayloadPath || '',
      emailTemplateName:    emailTemplateName     || '',
      emailSubject:         emailSubject          || '',
      emailHtml:            emailHtml             || '',
      inAppType:            inAppType             || '',
      inAppTitle:           inAppTitle            || '',
      inAppMessage:         inAppMessage          || '',
      enabled:              enabled !== false,
      priority:             priority || 0,
      label:                label    || '',
      createdBy:            req.user._id,
    });

    await _recordMappingVersion(req, { mapping, before: null, action: 'create' });

    res.status(201).json({ success: true, mapping });
  } catch (err) { next(err); }
};

// PATCH /api/admin/notifications/mappings/:id
exports.updateNotificationMapping = async (req, res, next) => {
  try {
    const before = await NotificationMapping.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ success: false, message: 'Mapping not found' });

    const updates = { updatedBy: req.user._id };
    MAPPING_EDITABLE_FIELDS.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const mapping = await NotificationMapping.findByIdAndUpdate(req.params.id, updates, { new: true });
    await _recordMappingVersion(req, { mapping, before, action: 'update' });

    res.json({ success: true, mapping });
  } catch (err) { next(err); }
};

// PATCH /api/admin/notifications/mappings/:id/toggle
exports.toggleNotificationMapping = async (req, res, next) => {
  try {
    const mapping = await NotificationMapping.findById(req.params.id);
    if (!mapping) return res.status(404).json({ success: false, message: 'Mapping not found' });
    const before = mapping.toObject();
    mapping.enabled   = !mapping.enabled;
    mapping.updatedBy = req.user._id;
    await mapping.save();

    await _recordMappingVersion(req, { mapping, before, action: 'toggle' });

    res.json({ success: true, mapping });
  } catch (err) { next(err); }
};

// DELETE /api/admin/notifications/mappings/:id
exports.deleteNotificationMapping = async (req, res, next) => {
  try {
    const mapping = await NotificationMapping.findById(req.params.id);
    if (!mapping) return res.status(404).json({ success: false, message: 'Mapping not found' });

    await _recordMappingVersion(req, { mapping, before: mapping.toObject(), action: 'delete' });
    await NotificationMapping.deleteOne({ _id: mapping._id });

    res.json({ success: true, message: 'Mapping deleted' });
  } catch (err) { next(err); }
};

// POST /api/admin/notifications/mappings/:id/clone
exports.cloneNotificationMapping = async (req, res, next) => {
  try {
    const source = await NotificationMapping.findById(req.params.id).lean();
    if (!source) return res.status(404).json({ success: false, message: 'Mapping not found' });

    const clone = await NotificationMapping.create({
      eventName:     source.eventName,
      recipientType: source.recipientType,
      channel:       source.channel,
      whatsappTemplateName: source.whatsappTemplateName,
      whatsappLanguage:     source.whatsappLanguage,
      whatsappVariables:    source.whatsappVariables,
      whatsappButtonType:        source.whatsappButtonType,
      whatsappButtonPayloadPath: source.whatsappButtonPayloadPath,
      emailTemplateName:    source.emailTemplateName,
      emailSubject:         source.emailSubject,
      emailHtml:            source.emailHtml,
      inAppType:            source.inAppType,
      inAppTitle:           source.inAppTitle,
      inAppMessage:         source.inAppMessage,
      enabled:              false, // cloned mappings start disabled to avoid accidental duplicate sends
      priority:             source.priority,
      label:                source.label ? `${source.label} (Copy)` : 'Copy',
      createdBy:            req.user._id,
    });

    await _recordMappingVersion(req, { mapping: clone, before: null, action: 'create', note: `Cloned from mapping ${source._id}` });

    res.status(201).json({ success: true, mapping: clone });
  } catch (err) { next(err); }
};

// POST /api/admin/notifications/mappings/bulk  — { ids: [], action: 'enable'|'disable'|'delete' }
exports.bulkNotificationMappings = async (req, res, next) => {
  try {
    const { ids, action } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ success: false, message: 'ids[] is required' });
    }
    if (!['enable', 'disable', 'delete'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action must be enable, disable, or delete' });
    }

    const mappings = await NotificationMapping.find({ _id: { $in: ids } });
    let affected = 0;

    for (const mapping of mappings) {
      const before = mapping.toObject();
      if (action === 'delete') {
        await _recordMappingVersion(req, { mapping, before, action: 'delete', note: 'Bulk delete' });
        await NotificationMapping.deleteOne({ _id: mapping._id });
      } else {
        mapping.enabled   = action === 'enable';
        mapping.updatedBy = req.user._id;
        await mapping.save();
        await _recordMappingVersion(req, { mapping, before, action: 'toggle', note: `Bulk ${action}` });
      }
      affected++;
    }

    res.json({ success: true, affected });
  } catch (err) { next(err); }
};

// GET /api/admin/notifications/mappings/export?eventName=&channel=&enabled=
exports.exportNotificationMappings = async (req, res, next) => {
  try {
    const { eventName, channel, enabled } = req.query;
    const query = {};
    if (eventName) query.eventName = eventName;
    if (channel)   query.channel   = channel;
    if (enabled !== undefined) query.enabled = enabled === 'true';

    const mappings = await NotificationMapping.find(query)
      .select(MAPPING_TRACKED_FIELDS.join(' '))
      .sort({ eventName: 1, priority: -1 })
      .lean();

    res.json({ success: true, exportedAt: new Date().toISOString(), count: mappings.length, mappings });
  } catch (err) { next(err); }
};

// POST /api/admin/notifications/mappings/import  — { mappings: [...] }
exports.importNotificationMappings = async (req, res, next) => {
  try {
    const { mappings } = req.body;
    if (!Array.isArray(mappings) || !mappings.length) {
      return res.status(400).json({ success: false, message: 'mappings[] is required' });
    }

    const created = [];
    const errors  = [];

    for (let i = 0; i < mappings.length; i++) {
      const m = mappings[i] || {};
      if (!m.eventName || !EVENTS[m.eventName]) {
        errors.push({ index: i, error: `Unknown or missing eventName "${m.eventName}"` });
        continue;
      }
      if (!m.recipientType || !m.channel) {
        errors.push({ index: i, error: 'recipientType and channel are required' });
        continue;
      }
      try {
        const mapping = await NotificationMapping.create({
          eventName:     m.eventName,
          recipientType: m.recipientType,
          channel:       m.channel,
          whatsappTemplateName: m.whatsappTemplateName || '',
          whatsappLanguage:     m.whatsappLanguage     || 'en',
          whatsappVariables:    m.whatsappVariables     || [],
          whatsappButtonType:        m.whatsappButtonType        || 'none',
          whatsappButtonPayloadPath: m.whatsappButtonPayloadPath || '',
          emailTemplateName:    m.emailTemplateName || '',
          emailSubject:         m.emailSubject      || '',
          emailHtml:            m.emailHtml         || '',
          inAppType:            m.inAppType    || '',
          inAppTitle:           m.inAppTitle   || '',
          inAppMessage:         m.inAppMessage || '',
          enabled:              m.enabled === true, // imported mappings start disabled unless explicitly true
          priority:             m.priority || 0,
          label:                m.label    || '',
          createdBy:            req.user._id,
        });
        await _recordMappingVersion(req, { mapping, before: null, action: 'create', note: 'Imported' });
        created.push(mapping._id);
      } catch (err) {
        errors.push({ index: i, error: err.message });
      }
    }

    res.json({ success: true, createdCount: created.length, errorCount: errors.length, errors });
  } catch (err) { next(err); }
};

// GET /api/admin/notifications/mappings/:id/history?page=
exports.getNotificationMappingHistory = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 20;

    const [versions, total] = await Promise.all([
      NotificationMappingVersion.find({ mappingId: req.params.id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-snapshot')
        .lean(),
      NotificationMappingVersion.countDocuments({ mappingId: req.params.id }),
    ]);

    res.json({ success: true, versions, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) { next(err); }
};

// POST /api/admin/notifications/mappings/:id/history/:versionId/restore
exports.restoreNotificationMappingVersion = async (req, res, next) => {
  try {
    const version = await NotificationMappingVersion.findById(req.params.versionId).lean();
    if (!version || String(version.mappingId) !== String(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Version not found for this mapping' });
    }

    const before = await NotificationMapping.findById(req.params.id);
    if (!before) return res.status(404).json({ success: false, message: 'Mapping not found' });
    const beforeSnapshot = before.toObject();

    const restoreFields = {};
    for (const key of MAPPING_EDITABLE_FIELDS) {
      if (key in (version.snapshot || {})) restoreFields[key] = version.snapshot[key];
    }
    restoreFields.updatedBy = req.user._id;

    const mapping = await NotificationMapping.findByIdAndUpdate(req.params.id, restoreFields, { new: true });
    await _recordMappingVersion(req, {
      mapping, before: beforeSnapshot, action: 'restore',
      note: `Restored from version ${version._id}`,
    });

    res.json({ success: true, mapping });
  } catch (err) { next(err); }
};

// ── Dry-run sample payload builder (Test/Dry-Run tab) ─────────────────────

function _sampleBookingDoc() {
  return {
    _id: 'sample-booking-id',
    bookingNumber: 'ZUT-SAMPLE-0001',
    userDetails: { name: 'Sample Customer', phone: '9876543210', email: 'sample.customer@example.com', address: 'Sample Address, Mumbai' },
    scheduledDate: new Date(),
    scheduledTime: '10:00 AM',
    grandTotal: 1500,
    amountPaid: 1500,
    status: 'confirmed',
    language: 'Hindi',
    paymentProvider: 'phonepe',
  };
}
function _samplePanditDoc() {
  return { _id: 'sample-pandit-id', userId: 'sample-user-id', name: 'Sample Pandit', phone: '9123456780', email: 'sample.pandit@example.com' };
}
function _sampleOrderDoc() {
  return {
    _id: 'sample-order-id', orderNumber: 'ORD-SAMPLE-0001', totalAmount: 799, status: 'shipped',
    shippingAddress: { name: 'Sample Customer', phone: '9876543210', address: 'Sample Address, Mumbai' },
    refundStatus: '',
  };
}
function _sampleUserDoc(req) {
  return { _id: req.user._id, name: req.user.name || 'Sample User', phone: req.user.phone || '9876543210', email: req.user.email || 'sample.user@example.com' };
}

// Builds ONE sample payload rich enough for any event, instead of guessing
// a single normalizer from the event's admin-UI display category. The old
// category-based guess (e.g. "Pandit"/"Referral" -> normalizePanditPayload
// only) produced a payload with a permanently-blank `customer`/`booking`
// for events like REFERRAL_BOOKING_CREATED whose *real* controller code
// (booking.controller.js) actually calls normalizeBookingPayload with a
// pandit attached — the dry-run then failed validation on `customer.name`
// even though the real, production-path payload was always correct. Every
// {{path}} any event could ever reference resolves here regardless of
// which of the five normalizers that event's real code happens to call —
// self-maintaining, so a newly added event/normalizer pairing can't drift
// out of sync with this sample builder the way the category guess did.
function buildSamplePayload(eventName, req, overrides = {}) {
  const samplePandit = _samplePanditDoc();
  const sampleUser   = _sampleUserDoc(req);
  const today = new Date().toLocaleDateString('en-IN');

  const bookingShaped = normalizeBookingPayload({
    booking: _sampleBookingDoc(), pandit: samplePandit, poojaName: 'Ganesh Puja',
    payment: { amount: 1500, method: 'phonepe', transactionId: 'SAMPLE-TXN-001', status: 'success' },
    refund: { amount: 500, status: 'processed' }, otp: '123456', reason: 'Sample reason',
    kit: { courier: 'Sample Courier', trackingId: 'SAMPLE-TRK-001' },
  });
  const orderShaped = normalizeOrderPayload({
    order: _sampleOrderDoc(), user: sampleUser,
    shipment: { courierName: 'Sample Courier', trackingNumber: 'SAMPLE-TRK-001' },
    reason: 'Sample reason', otp: '123456',
  });
  const panditShaped = normalizePanditPayload({
    pandit: samplePandit, user: sampleUser, reason: 'Sample reason',
    amount: 5000, batchId: 'BATCH-SAMPLE', bookingCount: 3,
  });
  const poojaRequestShaped = normalizePoojaRequestPayload({
    request: {
      poojaName: 'Sample Custom Pooja', expectedPrice: 2500,
      adminApprovedPrice: 2200, rejectionReason: 'Sample rejection reason',
    },
    pandit: samplePandit,
  });
  const userShaped = normalizeUserPayload({
    user: sampleUser, otp: '123456', reason: 'Sample reason',
    scheduledDate: today, requestedDate: today,
  });

  const payload = {
    customer: bookingShaped.customer,
    booking:  bookingShaped.booking,
    payment:  bookingShaped.payment,
    order:    orderShaped.order,
    pandit:   panditShaped.pandit,
    pooja:    poojaRequestShaped.pooja,
    kit:      bookingShaped.kit,
    refund:   bookingShaped.refund,
    otp:      bookingShaped.otp,
    account:  userShaped.account,
    reason:   bookingShaped.reason,
  };
  payload.user = payload.customer; // legacy alias, mirrors withLegacyAliases()

  if (overrides.phone) payload.customer.phone = overrides.phone;
  if (overrides.email) payload.customer.email = overrides.email;
  payload._eventName = eventName;
  return payload;
}

// POST /api/admin/notifications/mappings/:id/test
// Dry-run: renders the mapping's template against sample data and reports
// missing variables. Pass { send: true } to also actually dispatch it.
exports.testNotificationMapping = async (req, res, next) => {
  try {
    const mapping = await NotificationMapping.findById(req.params.id || req.body.mappingId);
    if (!mapping) return res.status(404).json({ success: false, message: 'Mapping not found' });

    const { overridePhone, overrideEmail, send } = req.body;
    const payload = buildSamplePayload(mapping.eventName, req, { phone: overridePhone, email: overrideEmail });

    const rawText = TemplateEngine.rawTemplateText(mapping.channel, mapping);
    const validation = TemplateValidator.validate(mapping.eventName, rawText, payload);
    const rendered = TemplateEngine.render(mapping.channel, mapping, payload);

    // WhatsApp gets a second, structural check on top of TemplateValidator's
    // REQUIRED_VARIABLES check: the exact per-position expected-vs-resolved
    // breakdown against the real Meta template (same function send() uses as
    // its pre-flight guard), so what the admin previews here is exactly what
    // would block or allow a real send — not a separate approximation of it.
    const whatsappChecklist = mapping.channel === 'whatsapp'
      ? await WhatsAppChannel.buildVariableChecklist(mapping, payload)
      : null;
    const valid = validation.valid && (whatsappChecklist ? whatsappChecklist.ok : true);
    const blockingReasons = [
      ...(validation.valid ? [] : [`Missing required variable(s): ${validation.missing.join(', ')}`]),
      ...(whatsappChecklist && !whatsappChecklist.ok ? [whatsappChecklist.reason] : []),
    ];

    const result = {
      success: true,
      eventName: mapping.eventName,
      channel: mapping.channel,
      sampleVariables: payload,
      rendered,
      missingVariables: validation.missing,
      whatsappChecklist,
      valid,
      blockingReasons,
      sent: false,
    };

    if (send === true) {
      if (!valid) {
        return res.status(400).json({ ...result, sent: false, sendError: `Cannot send — ${blockingReasons.join('; ')}` });
      }
      const recipients = await resolveRecipients(mapping.recipientType, payload);
      const recipient = recipients[0] || { userId: String(req.user._id), phone: overridePhone || '', email: overrideEmail || '' };
      try {
        const channel = ChannelRegistry.get(mapping.channel);
        const sendResult = await channel.send(mapping, payload, recipient);
        result.sent = !sendResult?.skip;
        result.sendResult = sendResult;
      } catch (err) {
        result.sent = false;
        result.sendError = err.message;
      }
    }

    res.json(result);
  } catch (err) { next(err); }
};

// GET /api/admin/notifications/logs
exports.getNotificationLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, type, status, event, recipientId } = req.query;
    const query = {};
    if (type)        query.type        = type;
    if (status)      query.status      = status;
    if (event)       query.event       = event;
    if (recipientId) query.recipientId = recipientId;

    const [logs, total] = await Promise.all([
      NotificationLog.find(query)
        .sort({ createdAt: -1 })
        .limit(+limit)
        .skip((+page - 1) * +limit)
        .lean(),
      NotificationLog.countDocuments(query),
    ]);

    const stats = await NotificationLog.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    res.json({ success: true, logs, total, page: +page, pages: Math.ceil(total / +limit) || 1, stats });
  } catch (err) { next(err); }
};

// POST /api/admin/notifications/logs/:id/retry — replay a failed job through the queue
exports.retryNotificationLog = async (req, res, next) => {
  try {
    const log = await NotificationLog.findById(req.params.id).lean();
    if (!log) return res.status(404).json({ success: false, message: 'Log not found' });
    if (!log.jobId) {
      return res.status(400).json({ success: false, message: 'This log has no associated job (pre-queue legacy entry) and cannot be auto-retried.' });
    }

    const NotificationJob = require('../models/NotificationJob');
    const job = await NotificationJob.findByIdAndUpdate(
      log.jobId,
      { status: 'retrying', nextAttemptAt: new Date(), lastError: '' },
      { new: true }
    );
    if (!job) return res.status(404).json({ success: false, message: 'Associated job not found' });

    res.json({ success: true, message: 'Job re-queued for retry', job });
  } catch (err) { next(err); }
};

// GET /api/admin/notifications/whatsapp-templates  — synced Meta templates for the dropdown
exports.getWhatsAppTemplatesForMapping = async (req, res, next) => {
  try {
    const templates = await WhatsAppTemplate.find({ status: 'APPROVED' })
      .select('name language status category components')
      .sort({ name: 1 })
      .lean();
    res.json({ success: true, templates });
  } catch (err) { next(err); }
};

// ─── Blog Permission Settings ─────────────────────────────────────────────────

// GET /api/admin/blog-permissions
exports.getBlogPermissions = async (req, res, next) => {
  try {
    const settings = await SystemSettings.findOne().select(
      'blogAdminPublish blogPanditPublish blogUserPublish blogPanditRequireApproval blogUserRequireApproval'
    ).lean();
    res.json({ success: true, permissions: settings || {} });
  } catch (err) { next(err); }
};

// PATCH /api/admin/blog-permissions
exports.updateBlogPermissions = async (req, res, next) => {
  try {
    const {
      blogAdminPublish, blogPanditPublish, blogUserPublish,
      blogPanditRequireApproval, blogUserRequireApproval,
    } = req.body;

    const updates = {};
    if (blogAdminPublish          !== undefined) updates.blogAdminPublish          = Boolean(blogAdminPublish);
    if (blogPanditPublish         !== undefined) updates.blogPanditPublish         = Boolean(blogPanditPublish);
    if (blogUserPublish           !== undefined) updates.blogUserPublish           = Boolean(blogUserPublish);
    if (blogPanditRequireApproval !== undefined) updates.blogPanditRequireApproval = Boolean(blogPanditRequireApproval);
    if (blogUserRequireApproval   !== undefined) updates.blogUserRequireApproval   = Boolean(blogUserRequireApproval);

    const settings = await SystemSettings.findOneAndUpdate({}, updates, { new: true, upsert: true });
    res.json({ success: true, message: 'Blog permissions updated', permissions: settings });
  } catch (err) { next(err); }
};
