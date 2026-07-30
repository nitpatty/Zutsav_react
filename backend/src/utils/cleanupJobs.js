const User         = require('../models/User');
const Pandit       = require('../models/Pandit');
const Booking      = require('../models/Booking');
const PaymentLedger = require('../models/PaymentLedger');
const Notification = require('../models/Notification');
const AdminAuditLog = require('../models/AdminAuditLog');
const { NotificationEngine } = require('../../notification-engine');
const { normalizeBookingPayload, normalizeUserPayload } = require('../../notification-engine/variables/PayloadNormalizer');
const { checkPhonePeStatus } = require('./phonepe');
const { recordAttemptResult } = require('./paymentAttempts');

/**
 * Permanently deletes user accounts that have passed their 30-day deletion grace period.
 * Called on server start and then every 24 hours.
 */
const performDeletionCleanup = async () => {
  try {
    const now = new Date();
    const usersToDelete = await User.find({
      accountStatus:         'deletion_pending',
      scheduledDeletionDate: { $lte: now },
    });

    if (usersToDelete.length === 0) return;

    for (const user of usersToDelete) {
      try {
        // 1. Clean up notifications
        await Notification.deleteMany({ userId: user._id });

        // 2. If pandit — delete Pandit document too
        if (user.role === 'pandit') {
          await Pandit.deleteOne({ userId: user._id });
        }

        // 3. Write audit log before deleting the user
        await AdminAuditLog.create({
          action:          'user_auto_deleted',
          targetId:        user._id,
          targetType:      'user',
          targetName:      user.name,
          targetEmail:     user.email || '',
          targetPhone:     user.phone || '',
          note:            'Automatic permanent deletion after 30-day grace period',
        });

        // 4. Delete the User document
        await User.deleteOne({ _id: user._id });

        // 5. Send final deletion email
        NotificationEngine.emit('ACCOUNT_DELETED', normalizeUserPayload({
          user,
          requestedDate: user.deletionRequestedAt ? new Date(user.deletionRequestedAt).toLocaleDateString('en-IN') : '',
        })).catch(() => {});

        console.log(`[Cleanup] Permanently deleted account: ${user.name} (${user.email || user.phone})`);
      } catch (err) {
        console.error(`[Cleanup] Failed to delete user ${user._id}:`, err.message);
      }
    }

    console.log(`[Cleanup] Processed ${usersToDelete.length} scheduled deletion(s)`);
  } catch (err) {
    console.error('[Cleanup] Deletion cleanup error:', err.message);
  }
};

const MS_PER_DAY    = 24 * 60 * 60 * 1000;
const MS_PER_HOUR   = 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

const startDeletionCleanupJob = () => {
  // Run once immediately (catches any deletions that occurred while server was down)
  performDeletionCleanup();
  // Then repeat every 24 hours
  setInterval(performDeletionCleanup, MS_PER_DAY);
  console.log('[Cleanup] Account deletion cleanup job started (runs daily)');
};

// ── Booking Reminder Jobs ────────────────────────────────────

/**
 * 24-hour service reminder.
 * Fires every 30 minutes; sends to bookings whose scheduledDate falls
 * within a ±2h window around "exactly 24h from now" and haven't been reminded yet.
 */
const run24hReminder = async () => {
  try {
    const now    = new Date();
    const target = new Date(now.getTime() + 24 * MS_PER_HOUR);
    const from   = new Date(target.getTime() - 2 * MS_PER_HOUR);
    const to     = new Date(target.getTime() + 2 * MS_PER_HOUR);

    const bookings = await Booking.find({
      status:         { $in: ['pandit_accepted', 'pandit_assigned'] },
      scheduledDate:  { $gte: from, $lte: to },
      reminder24hSent: { $ne: true },
    }).populate('poojaId', 'name');

    for (const booking of bookings) {
      try {
        const poojaName = booking.poojaId?.name || 'Pooja';
        NotificationEngine.emit('SERVICE_REMINDER_24H', normalizeBookingPayload({ booking, poojaName })).catch(() => {});

        await Booking.findByIdAndUpdate(booking._id, { reminder24hSent: true });
        console.log(`[Reminders] 24h reminder sent for booking ${booking.bookingNumber}`);
      } catch (err) {
        console.error(`[Reminders] 24h reminder failed for ${booking._id}:`, err.message);
      }
    }

    if (bookings.length > 0) {
      console.log(`[Reminders] 24h reminder job: processed ${bookings.length} booking(s)`);
    }
  } catch (err) {
    console.error('[Reminders] 24h reminder job error:', err.message);
  }
};

/**
 * 1-hour service reminder.
 * Fires every 10 minutes; sends to bookings whose scheduledDate is today AND
 * the parsed scheduledTime falls within 45–75 minutes from now.
 */
const run1hReminder = async () => {
  try {
    const now       = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const candidates = await Booking.find({
      status:        { $in: ['pandit_accepted', 'pandit_assigned'] },
      scheduledDate: { $gte: todayStart, $lte: todayEnd },
      reminder1hSent: { $ne: true },
    }).populate('poojaId', 'name');

    for (const booking of candidates) {
      try {
        // Try to parse the scheduled time string (e.g. "10:00 AM", "14:30", "10:00")
        const rawTime = (booking.scheduledTime || '').trim();
        const parsed  = parseTimeString(rawTime);
        if (!parsed) continue; // skip if time format can't be reliably parsed

        const serviceDate = new Date(booking.scheduledDate);
        const serviceAt   = new Date(
          serviceDate.getFullYear(), serviceDate.getMonth(), serviceDate.getDate(),
          parsed.hours, parsed.minutes, 0
        );

        const diffMs = serviceAt.getTime() - now.getTime();
        if (diffMs < 45 * MS_PER_MINUTE || diffMs > 75 * MS_PER_MINUTE) continue;

        const poojaName = booking.poojaId?.name || 'Pooja';
        NotificationEngine.emit('SERVICE_REMINDER_1H', normalizeBookingPayload({ booking, poojaName })).catch(() => {});

        await Booking.findByIdAndUpdate(booking._id, { reminder1hSent: true });
        console.log(`[Reminders] 1h reminder sent for booking ${booking.bookingNumber}`);
      } catch (err) {
        console.error(`[Reminders] 1h reminder failed for ${booking._id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Reminders] 1h reminder job error:', err.message);
  }
};

/**
 * Parse "HH:MM AM/PM" or "HH:MM" (24h) strings.
 * Returns { hours, minutes } in 24h format, or null if unparseable.
 */
function parseTimeString(raw) {
  if (!raw) return null;
  // Match "10:30 AM", "02:00 PM", "14:30", "9:00"
  const match12 = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = parseInt(match12[2], 10);
    const meridiem = match12[3].toUpperCase();
    if (meridiem === 'PM' && h !== 12) h += 12;
    if (meridiem === 'AM' && h === 12) h = 0;
    return { hours: h, minutes: m };
  }
  const match24 = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    return { hours: parseInt(match24[1], 10), minutes: parseInt(match24[2], 10) };
  }
  return null; // non-parseable formats like "Morning", "Afternoon" — skip 1h reminder
}

/**
 * Feedback + invoice reminder.
 * Fires every hour; sends to completed bookings (no rating yet) from 2–6h ago.
 */
const runFeedbackReminder = async () => {
  try {
    const now       = new Date();
    const from      = new Date(now.getTime() - 6 * MS_PER_HOUR);
    const to        = new Date(now.getTime() - 2 * MS_PER_HOUR);

    const bookings = await Booking.find({
      status:              'completed',
      completedAt:         { $gte: from, $lte: to },
      rating:              null,
      feedbackReminderSent: { $ne: true },
    }).populate('poojaId', 'name');

    for (const booking of bookings) {
      try {
        const poojaName = booking.poojaId?.name || 'Pooja';
        NotificationEngine.emit('FEEDBACK_REQUEST', normalizeBookingPayload({ booking, poojaName })).catch(() => {});

        await Booking.findByIdAndUpdate(booking._id, { feedbackReminderSent: true });
        console.log(`[Reminders] Feedback reminder sent for booking ${booking.bookingNumber}`);
      } catch (err) {
        console.error(`[Reminders] Feedback reminder failed for ${booking._id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Reminders] Feedback reminder job error:', err.message);
  }
};

/**
 * Invoice send-up job.
 * Fires every hour; sends invoice to completed bookings where invoice hasn't been sent yet.
 * Acts as a safety net in case the immediate invoice send on completion failed.
 */
const runInvoiceJob = async () => {
  try {
    const cutoff = new Date(Date.now() - 30 * MS_PER_MINUTE); // only bookings completed > 30min ago

    const bookings = await Booking.find({
      status:       'completed',
      completedAt:  { $lte: cutoff },
      invoiceSent:  { $ne: true },
    }).populate('poojaId', 'name');

    for (const booking of bookings) {
      try {
        const poojaName = booking.poojaId?.name || 'Pooja';
        NotificationEngine.emit('INVOICE_GENERATED', normalizeBookingPayload({ booking, poojaName })).catch(() => {});
        await Booking.findByIdAndUpdate(booking._id, { invoiceSent: true });
        console.log(`[Reminders] Invoice sent for booking ${booking.bookingNumber}`);
      } catch (err) {
        console.error(`[Reminders] Invoice failed for ${booking._id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Reminders] Invoice job error:', err.message);
  }
};

const startBookingReminderJobs = () => {
  // Run immediately on start to catch any missed reminders
  run24hReminder();
  runFeedbackReminder();
  runInvoiceJob();

  setInterval(run24hReminder,      30 * MS_PER_MINUTE); // every 30 min
  setInterval(run1hReminder,       10 * MS_PER_MINUTE); // every 10 min
  setInterval(runFeedbackReminder, MS_PER_HOUR);        // every hour
  setInterval(runInvoiceJob,       MS_PER_HOUR);        // every hour

  console.log('[Reminders] Booking reminder jobs started (24h/30min, 1h/10min, feedback+invoice/1h)');
};

// ── Stale Payment Attempt Sweep ───────────────────────────────

/**
 * Handles the "browser closed / user never returns" case: a booking whose
 * PhonePe order was created 30+ minutes ago, has never been confirmed, and
 * whose webhook never fired. Actively asks PhonePe for the real status
 * (never blind-marks failure) and applies the same mark-as-failed logic
 * used by the verify endpoints/webhook. Never deletes or cancels the
 * booking — it stays pending_payment, retryable, and visible to admin.
 */
const sweepStalePaymentAttempts = async () => {
  try {
    const staleBefore = new Date(Date.now() - 30 * MS_PER_MINUTE);
    const bookings = await Booking.find({
      status:               'pending_payment',
      paymentStatus:         'PENDING',
      lastPaymentAttemptAt:  { $lte: staleBefore },
      phonePeMerchantTransactionId: { $ne: null },
    }).populate('poojaId', 'name');

    for (const booking of bookings) {
      try {
        const merchantTransactionId = booking.phonePeMerchantTransactionId;
        const result = await checkPhonePeStatus(merchantTransactionId);
        if (!result.state || result.state === 'PENDING') continue; // still genuinely pending — leave it

        if (result.success) continue; // let the user's own verify/webhook handle success as usual

        const ledger = await PaymentLedger.findOne({ merchantTransactionId });
        if (ledger && ledger.paymentStatus === 'PENDING') {
          ledger.paymentStatus = 'FAILED';
          await ledger.save();
        }

        await recordAttemptResult(booking, merchantTransactionId, {
          status: 'FAILED', gatewayCode: result.code, gatewayState: result.state,
          failureReason: result.code || result.state || 'Payment abandoned',
        }, booking.poojaId?.name || '');
        await booking.save();

        console.log(`[PaymentSweep] Marked booking ${booking.bookingNumber} payment as FAILED (stale, gateway state: ${result.state})`);
      } catch (err) {
        console.error(`[PaymentSweep] Failed to sweep booking ${booking._id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[PaymentSweep] Stale payment sweep error:', err.message);
  }
};

const startPaymentSweepJob = () => {
  setInterval(sweepStalePaymentAttempts, 10 * MS_PER_MINUTE);
  console.log('[PaymentSweep] Stale payment attempt sweep job started (runs every 10 min)');
};

// ── Translation Lock Sweep ────────────────────────────────────

/**
 * Recovers translation-cache locks left stuck in 'pending' by a process
 * crash mid-Groq-call (see services/translationService.js). 2 minutes is
 * comfortably above Groq's own 30s translation timeout, so this only fires
 * on genuine crashes, not normal slow responses. The next read request for
 * that entity/language sees 'failed' and retries — no separate retry queue.
 */
const sweepStaleTranslationLocks = async () => {
  try {
    const Translation = require('../models/Translation');
    const staleBefore = new Date(Date.now() - 2 * MS_PER_MINUTE);
    const result = await Translation.updateMany(
      { status: 'pending', lockedAt: { $lt: staleBefore } },
      { $set: { status: 'failed', lastError: 'stale lock recovered by sweep' } }
    );
    if (result.modifiedCount) {
      console.log(`[Translation] Sweep recovered ${result.modifiedCount} stale lock(s)`);
    }
  } catch (err) {
    console.error('[Translation] Lock sweep error:', err.message);
  }
};

const startTranslationLockSweep = () => {
  setInterval(sweepStaleTranslationLocks, 2 * MS_PER_MINUTE);
  console.log('[Translation] Stale lock sweep job started (runs every 2 min)');
};

module.exports = {
  startDeletionCleanupJob,
  performDeletionCleanup,
  startBookingReminderJobs,
  run24hReminder,
  run1hReminder,
  runFeedbackReminder,
  runInvoiceJob,
  startTranslationLockSweep,
  sweepStaleTranslationLocks,
  startPaymentSweepJob,
  sweepStalePaymentAttempts,
};
