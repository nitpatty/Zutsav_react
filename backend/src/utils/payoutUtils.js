const Booking = require('../models/Booking');

// Resolves the pandit payout amount for a completed booking from admin-approved
// sources ONLY: the pandit's admin-approved per-pooja price, or an admin-negotiated
// fare captured on the booking. The pandit's own self-declared `expectedCharges`
// (an unvetted ask) must NEVER be used to determine a payout — only an admin
// action (price approval or fare negotiation) counts as "approved".
function resolveApprovedPayoutAmount(booking, pandit) {
  if (booking.payout?.amount > 0) return booking.payout.amount;
  if (!pandit || !booking.poojaId) return 0;

  const poojaId = booking.poojaId._id || booking.poojaId;
  const charge = pandit.poojaCharges?.find(
    (c) => c.poojaId && c.poojaId.toString() === poojaId.toString()
  );
  if (charge?.priceApprovalStatus === 'approved' && charge.approvedPrice > 0) {
    return charge.approvedPrice;
  }
  if (booking.panditFareAmount > 0) {
    return booking.panditFareAmount;
  }
  return 0;
}

// Pandit-facing payout status label. The pandit must never see a payout figure
// until the admin has actually approved one — `booking.payout.amount` is the
// single source of truth on both the admin and pandit sides.
function getPanditPayoutStatusLabel(booking) {
  if (booking.payout?.status === 'completed') return 'Paid';
  if ((booking.payout?.amount || 0) > 0) return 'Awaiting Admin Payout';
  return 'Waiting for Admin Approval';
}

// Backfills payout.amount for a pandit's completed-but-unresolved bookings from
// admin-approved sources (see resolveApprovedPayoutAmount). Needed because a
// booking can be completed before the admin approves the pandit's price for
// that pooja — once approved, this heals the stale zero so both the admin and
// pandit dashboards immediately agree without a separate write path.
async function healPanditPendingPayouts(panditId, pandit) {
  const unresolved = await Booking.find({
    panditId,
    status:          'completed',
    'payout.status': 'pending',
    'payout.amount': { $lte: 0 },
  }).select('poojaId panditFareAmount payout');

  for (const booking of unresolved) {
    const healed = resolveApprovedPayoutAmount(booking, pandit);
    if (healed > 0) {
      await Booking.findByIdAndUpdate(booking._id, { 'payout.amount': healed });
    }
  }
}

module.exports = {
  resolveApprovedPayoutAmount,
  getPanditPayoutStatusLabel,
  healPanditPendingPayouts,
};
