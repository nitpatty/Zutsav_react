/**
 * One-off migration: backfills PoojaRequest records from legacy pandit-
 * submitted Pooja documents (createdByRole: 'pandit'), which used to double
 * as both the "request" and the live catalogue row before the dedicated
 * PoojaRequest workflow existed. Run manually via
 * `node src/scripts/migratePanditPoojaRequests.js` from the backend/ directory
 * — NOT run automatically on server boot.
 *
 * The original expected price was never captured under the old model, so
 * both expectedPrice and adminApprovedPrice are backfilled from the Pooja's
 * stored price (best-effort — the only value that ever existed).
 *
 * Idempotent: skips any Pooja that already has a linked PoojaRequest
 * (matched via poojaId), safe to re-run.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Pooja        = require('../models/Pooja');
const Pandit        = require('../models/Pandit');
const PoojaRequest  = require('../models/PoojaRequest');

const STATUS_MAP = {
  pending:  'pending',
  approved: 'approved',
  rejected: 'rejected',
  inactive: 'approved', // was live at some point before being deactivated
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const legacyPoojas = await Pooja.find({ createdByRole: 'pandit' });
  if (!legacyPoojas.length) {
    console.log('No legacy pandit-submitted poojas found — nothing to migrate.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${legacyPoojas.length} legacy pandit-submitted pooja(s).`);

  let migrated = 0, skipped = 0, missingPandit = 0;

  for (const pooja of legacyPoojas) {
    const already = await PoojaRequest.findOne({ poojaId: pooja._id });
    if (already) { skipped++; continue; }

    if (!pooja.panditId) { missingPandit++; continue; }
    const pandit = await Pandit.findById(pooja.panditId).select('_id');
    if (!pandit) { missingPandit++; continue; }

    const status = STATUS_MAP[pooja.approvalStatus] || 'pending';

    await PoojaRequest.create({
      panditId: pooja.panditId,
      poojaName: pooja.name,
      categoryId: pooja.categoryId,
      description: pooja.description || '',
      shortDesc: pooja.shortDesc || '',
      estimatedDuration: pooja.durationValue || 1,
      estimatedDurationUnit: pooja.durationUnit || 'hours',
      expectedPrice: pooja.price,
      requirements: pooja.requirements || [],
      benefits: pooja.benefits || [],
      languages: pooja.languages || [],
      image: pooja.image || null,
      status,
      adminApprovedPrice: status === 'approved' ? pooja.price : null,
      rejectionReason: status === 'rejected' ? (pooja.adminNote || 'Not specified (migrated from legacy record)') : '',
      adminNote: pooja.adminNote || '',
      reviewedAt: status === 'pending' ? null : pooja.updatedAt,
      poojaId: status === 'approved' ? pooja._id : null,
    });
    migrated++;
  }

  console.log(`\nDone. Migrated ${migrated}, already-migrated (skipped) ${skipped}, missing pandit ${missingPandit}.`);
  await mongoose.disconnect();
})().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
