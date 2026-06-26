/**
 * Centralized price calculation engine (client-side).
 * Must mirror the logic in backend/src/controllers/booking.controller.js → calculatePricing()
 *
 * Business rules:
 *   - Pooja service is always GST-exempt (no tax on poojaAmount ever)
 *   - platformGstPercent applies to: platformFee + kitAmount
 *   - Products use their own per-product taxRate (not platformGstPercent)
 *
 * Formula:
 *   platformFee  = fixed commission OR poojaPrice × commissionPercent / 100
 *   platformGST  = platformFee × gstPercent / 100
 *   kitGST       = kitAmount × gstPercent / 100
 *   grandTotal   = poojaAmount + platformFee + platformGST + kitAmount + kitGST
 */

export function calculatePrice({
  poojaPrice        = 0,
  kitPrice          = 0,
  commissionPercent = 0,
  commissionFixed   = 0,
  commissionType    = 'percent',
  gstPercent        = 0,
}) {
  const poojaAmount = Math.round(poojaPrice);
  const platformFee = commissionType === 'fixed'
    ? Math.round(commissionFixed)
    : Math.round((poojaPrice * commissionPercent) / 100);
  const platformGST = Math.round((platformFee * gstPercent) / 100);
  const kitAmount   = Math.round(kitPrice);
  const kitGST      = Math.round((kitAmount * gstPercent) / 100);
  const grandTotal  = poojaAmount + platformFee + platformGST + kitAmount + kitGST;

  return {
    poojaAmount,
    platformFee,
    platformGST,
    kitAmount,
    kitGST,
    grandTotal,
    commissionPercent,
    commissionFixed,
    commissionType,
    gstPercent,
    // backward compat alias
    taxAmount: kitGST,
  };
}

/** Savings percentage: how much cheaper is discountPrice vs totalCost */
export function kitSavingsPct(totalCost, discountPrice) {
  if (!totalCost || totalCost <= discountPrice) return 0;
  return Math.round(((totalCost - discountPrice) / totalCost) * 100);
}

/** Format rupees with Indian locale */
export function formatINR(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN')}`;
}
