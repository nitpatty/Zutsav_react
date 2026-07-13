/**
 * Centralized financial calculation engine.
 *
 * Every GST / commission / tax / pricing calculation in the app MUST go
 * through this module — no duplicate pricing logic anywhere else.
 *
 * Rounding policy: round to the nearest PAISA (2 decimals) — the smallest
 * real unit of INR. Never round to whole rupees. Full floating-point
 * precision is preserved through every intermediate multiplication; the
 * 2dp rounding is applied once per computed component, not repeatedly.
 *
 * `Math.round(amount * 100) / 100` is not reliable for currency due to JS
 * float representation (e.g. it mis-rounds 35.855 to 35.85 instead of
 * 35.86). toFixed(4) first cleans up the float noise before the final round.
 */

function roundToPaise(amount) {
  const n = Number(amount) || 0;
  return Math.round(Number((n * 100).toFixed(4))) / 100;
}

/** amount = base × percent / 100, rounded to the nearest paisa */
function calculatePercentage(base, percent) {
  return roundToPaise((Number(base) * Number(percent)) / 100);
}

/**
 * Full pooja/kit/commission/GST pricing engine.
 *   platformFee  = fixed commission OR poojaAmount × commissionPercent / 100
 *   platformGST  = platformFee × gstPercent / 100
 *   kitGST       = kitAmount × gstPercent / 100
 *   grandTotal   = poojaAmount + platformFee + platformGST + kitAmount + kitGST
 * Pooja service itself is always GST-exempt (no tax on poojaAmount).
 */
function calculatePricing({
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
  const kitAmount    = roundToPaise(kitPrice);
  const kitGST       = calculatePercentage(kitAmount, gstPercent);
  const grandTotal   = roundToPaise(poojaAmount + platformFee + platformGST + kitAmount + kitGST);

  return {
    poojaAmount,
    platformFee,
    platformGST,
    kitAmount,
    kitGST,
    grandTotal,
    commissionType,
    commissionPercent,
    commissionFixed,
    gstPercent,
    baseAmount:       poojaAmount,
    commissionAmount: platformFee,
    taxAmount:        kitGST,
    gstAmount:        roundToPaise(platformGST + kitGST),
    kitGstPercent:    gstPercent,
    finalAmount:      grandTotal,
  };
}

/** Marketplace product line-item tax = unitPrice × quantity × taxRate / 100 */
function calculateItemTax(unitPrice, quantity, taxRate) {
  return calculatePercentage(Number(unitPrice) * Number(quantity), taxRate);
}

module.exports = { roundToPaise, calculatePercentage, calculatePricing, calculateItemTax };
