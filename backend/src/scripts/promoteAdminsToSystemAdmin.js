/**
 * One-off migration: promotes every existing role:'admin' user to
 * role:'system_admin'. Run manually via `node src/scripts/promoteAdminsToSystemAdmin.js`
 * from the backend/ directory — this is NOT run automatically on server boot.
 *
 * Safe to re-run: promoting an already-promoted account is a no-op (the
 * $in filter no longer matches it on a second run).
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const admins = await User.find({ role: 'admin' }).select('_id name email phone');
  if (!admins.length) {
    console.log('No role:"admin" accounts found — nothing to promote.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Promoting ${admins.length} admin account(s) to system_admin:`);
  for (const a of admins) {
    console.log(`  - ${a._id} ${a.name} <${a.email || a.phone}>`);
  }

  const result = await User.updateMany({ role: 'admin' }, { $set: { role: 'system_admin' } });
  console.log(`\nDone. Matched ${result.matchedCount}, modified ${result.modifiedCount}.`);

  await mongoose.disconnect();
})().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
