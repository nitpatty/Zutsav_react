/**
 * Centralized price calculation engine (client-side).
 * Must mirror the logic in backend/src/utils/financeUtils.js → calculatePricing()
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
 *
 * Rounding policy: round to the nearest PAISA (2 decimals) — the smallest
 * real unit of INR. Never round to whole rupees. Full floating-point
 * precision is preserved through every intermediate multiplication; the
 * 2dp rounding is applied once per computed component.
 *
 * `Math.round(amount * 100) / 100` is not reliable for currency due to JS
 * float representation (e.g. it mis-rounds 35.855 to 35.85 instead of
 * 35.86). toFixed(4) first cleans up the float noise before the final round.
 */

export function roundToPaise(amount) {
  const n = Number(amount) || 0;
  return Math.round(Number((n * 100).toFixed(4))) / 100;
}

/** amount = base × percent / 100, rounded to the nearest paisa */
function calculatePercentage(base, percent) {
  return roundToPaise((Number(base) * Number(percent)) / 100);
}

export function calculatePrice({
  poojaPrice        = 0,
  kitPrice          = 0,
  commissionPercent = 0,
  commissionFixed   = 0,
  commissionType    = 'percent',
  gstPercent        = 0,
}) {
  const poojaAmount = roundToPaise(poojaPrice);
  const platformFee = commissionType === 'fixed'
    ? roundToPaise(commissionFixed)
    : calculatePercentage(poojaAmount, commissionPercent);
  const platformGST = calculatePercentage(platformFee, gstPercent);
  const kitAmount   = roundToPaise(kitPrice);
  const kitGST      = calculatePercentage(kitAmount, gstPercent);
  const grandTotal  = roundToPaise(poojaAmount + platformFee + platformGST + kitAmount + kitGST);

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

/** Marketplace product line-item tax = unitPrice × quantity × taxRate / 100 */
export function calculateItemTax(unitPrice, quantity, taxRate) {
  return calculatePercentage(Number(unitPrice) * Number(quantity), taxRate);
}

/** Savings percentage: how much cheaper is discountPrice vs totalCost */
export function kitSavingsPct(totalCost, discountPrice) {
  if (!totalCost || totalCost <= discountPrice) return 0;
  return Math.round(((totalCost - discountPrice) / totalCost) * 100);
}

/** Format rupees with Indian locale — preserves decimal precision (no auto-rounding) */
export function formatINR(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
