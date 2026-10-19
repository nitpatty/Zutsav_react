/**
 * Safe development smoke test (throwaway script — not part of the test suite).
 *
 * Exercises the FULL real chain with NO notification spy, against a dedicated
 * throwaway database. Proves:
 *   1. a Pandit can cancel an accepted booking,
 *   2. the real notification engine resolves ADMIN recipients (including a
 *      system_admin, which the old role:'admin'-only filter silently dropped),
 *   3. jobs are enqueued for all three channels (inapp / email / whatsapp),
 *   4. the customer receives NOTHING,
 *   5. the resulting pending_reassignment booking is reassignable by the
 *      existing admin flow with no code changes.
 *
 * Run:  node scripts/smoke-pandit-cancellation.js
 * It creates and then DROPS its own database. Never touches dev/prod.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'smoke-cancel-secret';

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const express = require('express');

const SMOKE_DB = 'zutsav_smoke_pandit_cancellation';
const TEST_URI = `mongodb://127.0.0.1:27017/${SMOKE_DB}`;

const User    = require('../src/models/User');
const Pandit  = require('../src/models/Pandit');
const Pooja   = require('../src/models/Pooja');
const Booking = require('../src/models/Booking');
const NotificationJob = require('../src/models/NotificationJob');
const NotificationMapping = require('../src/models/NotificationMapping');

const bootstrap = require('../src/scripts/bootstrapNotificationMappings');
const panditRoutes = require('../src/routes/pandit.routes');
const adminRoutes  = require('../src/routes/admin.routes');

const sign = (u) => jwt.sign({ id: String(u._id) }, process.env.JWT_SECRET);
const day = (n) => { const t = new Date(); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + n)); };
const ok = (c, m) => console.log(`${c ? '  PASS' : '  FAIL'}  ${m}`) || c;
let failures = 0;
const check = (c, m) => { if (!ok(c, m)) failures++; };

(async () => {
  await mongoose.connect(TEST_URI);
  console.log(`\nSmoke DB: ${SMOKE_DB}\n`);

  const app = express();
  app.use(express.json());
  app.use('/api/pandits', panditRoutes);
  app.use('/api/admin', adminRoutes);
  app.use((err, req, res, _next) => res.status(err.status || 500).json({
    success: false, ...(typeof err.code === 'string' ? { code: err.code } : {}), message: err.message,
  }));
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  // ── Seed ──────────────────────────────────────────────────────────────────
  // A system_admin is the account the real seed script creates; it is the exact
  // case the old `role: 'admin'` recipient filter missed.
  const systemAdmin = await User.create({ name: 'Root Admin', email: 'root@smoke.test', phone: '9001000001', password: 'hashed123', role: 'system_admin' });
  const plainAdmin  = await User.create({ name: 'Ops Admin',  email: 'ops@smoke.test',  phone: '9001000002', password: 'hashed123', role: 'admin' });
  const inactiveAdm = await User.create({ name: 'Retired',    email: 'old@smoke.test',  phone: '9001000003', password: 'hashed123', role: 'admin', isActive: false });
  const inactiveAdm2= await User.create({ name: 'Deleted',    email: 'del@smoke.test',  phone: '9001000004', password: 'hashed123', role: 'admin', isDeleted: true });

  const customer = await User.create({ name: 'Devotee', email: 'devotee@smoke.test', phone: '9002000001', password: 'hashed123', role: 'user', address: '1 Lane', pincode: '110001' });
  const pUser = await User.create({ name: 'Ramesh Sharma', email: 'ramesh@smoke.test', phone: '9003000001', password: 'hashed123', role: 'pandit' });
  const p2User= await User.create({ name: 'Suresh Kumar',  email: 'suresh@smoke.test', phone: '9003000002', password: 'hashed123', role: 'pandit' });

  const pandit = await Pandit.create({ userId: pUser._id,  name: 'Ramesh Sharma', phone: '9003000001', email: 'ramesh@smoke.test', status: 'approved', canReceiveBookings: true, isOnline: true });
  const pandit2= await Pandit.create({ userId: p2User._id, name: 'Suresh Kumar',  phone: '9003000002', email: 'suresh@smoke.test', status: 'approved', canReceiveBookings: true, isOnline: true });
  const pooja  = await Pooja.create({ name: 'Ganesh Pooja', slug: 'ganesh-smoke', price: 1000, createdByRole: 'admin', approvalStatus: 'approved', isActive: true });

  // Install the real mappings so the engine finds them.
  for (const e of bootstrap.VERIFIED_MAPPINGS) await bootstrap.applyEntry(e);
  for (const e of bootstrap.VERIFIED_EMAIL_MAPPINGS) await bootstrap.applyEmailEntry(e);
  for (const e of bootstrap.VERIFIED_INAPP_MAPPINGS) await bootstrap.applyInAppEntry(e);

  const booking = await Booking.create({
    bookingNumber: 'SMOKE-CANCEL-1',
    userId: customer._id, poojaId: pooja._id,
    userDetails: { name: 'Devotee', phone: '9002000001', email: 'devotee@smoke.test', address: '1 Lane', pincode: '110001' },
    scheduledDate: day(12), scheduledTime: '10:00',
    amount: 1000, grandTotal: 1000, status: 'pandit_accepted',
    paymentStatus: 'FULLY_PAID', amountPaid: 1000, panditId: pandit._id,
  });

  // ── 1. Cancel ─────────────────────────────────────────────────────────────
  console.log('1) Pandit cancels the accepted booking');
  const cancelRes = await fetch(`${base}/api/pandits/me/bookings/${booking._id}/cancel`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sign(pUser)}` },
    body: JSON.stringify({ reason: 'Family emergency, cannot attend' }),
  });
  const cancelBody = await cancelRes.json();
  check(cancelRes.status === 200, `cancel returned 200 (got ${cancelRes.status})`);
  check(cancelBody.booking?.status === 'pending_reassignment', `status -> pending_reassignment (got ${cancelBody.booking?.status})`);
  check(cancelBody.booking?.panditId === null, 'pandit released');

  const after = await Booking.findById(booking._id);
  check(after.paymentStatus === 'FULLY_PAID', 'customer NOT refunded');
  check(after.refund.refundedAmount === 0, 'no refund seeded');
  check(after.auditLog.some((a) => a.action === 'pandit_cancelled_accepted'), 'audit entry written');
  check(after.cancelReason === 'Family emergency, cannot attend', 'reason stored');

  // The controller fires emit() without awaiting; give the engine a moment.
  await new Promise((r) => setTimeout(r, 400));

  // ── 2/3/4. Notification fan-out ───────────────────────────────────────────
  console.log('\n2) Notification engine fan-out (real engine, no spy)');
  const jobs = await NotificationJob.find({ eventName: 'PANDIT_CANCELLED' }).lean();
  const channels = [...new Set(jobs.map((j) => j.channel))].sort();
  console.log(`   channels: ${channels.join(', ')}  |  total jobs: ${jobs.length}`);

  check(channels.includes('inapp'), 'in-app job queued');
  check(channels.includes('email'), 'email job queued');
  check(channels.includes('whatsapp'), 'whatsapp job queued');

  const recipients = [...new Set(jobs.map((j) => String(j.recipient?.userId)))].sort();
  console.log(`   recipients: ${recipients.length}`);
  check(recipients.includes(String(systemAdmin._id)), 'system_admin received it (old filter dropped this)');
  check(recipients.includes(String(plainAdmin._id)), 'admin received it');
  check(!recipients.includes(String(inactiveAdm._id)), 'inactive admin excluded');
  check(!recipients.includes(String(inactiveAdm2._id)), 'deleted admin excluded');
  check(!recipients.includes(String(customer._id)), 'CUSTOMER received nothing');
  check(recipients.length === 2, `exactly 2 admin recipients, got ${recipients.length}`);

  const perChannel = channels.map((c) => `${c}=${jobs.filter((j) => j.channel === c).length}`).join(' ');
  console.log(`   per channel: ${perChannel}  (2 admins x 3 channels = 6 expected)`);
  check(jobs.length === 6, `6 jobs total, got ${jobs.length}`);

  const mappingCount = await NotificationMapping.countDocuments({ eventName: 'PANDIT_CANCELLED' });
  check(mappingCount === 3, `3 mappings installed, got ${mappingCount}`);

  // WhatsApp cannot actually send: the Meta template is not created/approved yet.
  const waJob = jobs.find((j) => j.channel === 'whatsapp');
  if (waJob) {
    const { buildVariableChecklist } = require('../notification-engine/channels/WhatsAppChannel');
    const mapping = await NotificationMapping.findById(waJob.mappingId);
    const payload = waJob.normalizedPayload;
    const cl = await buildVariableChecklist(mapping, payload);
    console.log(`   whatsapp checklist ok=${cl.ok} reason="${cl.reason || 'all resolved'}"`);
    check(/not found in synced WhatsAppTemplate collection/.test(cl.reason || ''),
      'whatsapp safely skips pending Meta template approval (expected pre-deploy)');
  }

  // ── 5. Reassignment via the EXISTING admin flow ───────────────────────────
  console.log('\n3) Admin reassigns a replacement Pandit (existing flow, unchanged)');
  const assignRes = await fetch(`${base}/api/admin/bookings/${booking._id}/assign`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sign(systemAdmin)}` },
    body: JSON.stringify({ panditId: String(pandit2._id) }),
  });
  const assignBody = await assignRes.json().catch(() => ({}));
  check(assignRes.status === 200, `assign returned 200 (got ${assignRes.status}: ${JSON.stringify(assignBody).slice(0, 160)})`);

  const final = await Booking.findById(booking._id);
  check(final.status === 'pandit_assigned', `reassigned -> pandit_assigned (got ${final.status})`);
  check(final.panditId?.toString() === pandit2._id.toString(), 'replacement pandit assigned');
  check(final.paymentStatus === 'FULLY_PAID', 'still not refunded through the whole cycle');

  // ── Cleanup ───────────────────────────────────────────────────────────────
  await new Promise((r) => server.close(r));
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();

  console.log(`\n${failures === 0 ? 'SMOKE TEST PASSED' : `SMOKE TEST FAILED (${failures} check(s))`} — database dropped\n`);
  process.exitCode = failures === 0 ? 0 : 1;
})().catch(async (e) => {
  console.error('\nSMOKE ERROR:', e);
  try { await mongoose.connection.dropDatabase(); await mongoose.connection.close(); } catch {}
  process.exitCode = 1;
});
