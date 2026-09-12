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
 *
 * URGENT HIKE (optional; applied only when `urgent` is true):
 *   The surcharge is added to the EXISTING gross `grandTotal` AFTER the tax/fee
 *   calculations above and BEFORE any coupon / coin deduction — it never
 *   re-taxes the fee/kit components and never re-runs the base pricing.
 *     percent mode → urgentSurcharge = calculatePercentage(grandTotal, urgentHikePercent)
 *     fixed mode   → urgentSurcharge = roundToPaise(urgentHikeFixed)
 *   With no hike configured (0 in the active mode) the output — including
 *   `grandTotal`, `finalAmount` and every component — is IDENTICAL to a normal
 *   booking, so normal bookings are untouched.
 */
function calculatePricing({
  poojaPrice        = 0,
  kitPrice          = 0,
  commissionPercent = 0,
  commissionFixed   = 0,
  commissionType    = 'percent',
  gstPercent        = 0,
  urgent            = false,
  urgentHikeType    = 'percent',
  urgentHikePercent = 0,
  urgentHikeFixed   = 0,
}) {
  const poojaAmount = roundToPaise(poojaPrice);
  const platformFee = commissionType === 'fixed'
    ? roundToPaise(commissionFixed)
    : calculatePercentage(poojaAmount, commissionPercent);
  const platformGST = calculatePercentage(platformFee, gstPercent);
  const kitAmount    = roundToPaise(kitPrice);
  const kitGST       = calculatePercentage(kitAmount, gstPercent);
  const grandTotal   = roundToPaise(poojaAmount + platformFee + platformGST + kitAmount + kitGST);

  // Urgent booking surcharge — computed on the EXISTING gross total only when
  // the booking is urgent AND the active mode's rate is greater than 0.
  let urgentSurcharge = 0;
  const hikeType = urgent ? (urgentHikeType || 'percent') : 'percent';
  const hikePercent = Number(urgentHikePercent) || 0;
  const hikeFixed = Number(urgentHikeFixed) || 0;
  if (urgent) {
    if (hikeType === 'fixed') {
      urgentSurcharge = hikeFixed > 0 ? roundToPaise(hikeFixed) : 0;
    } else {
      urgentSurcharge = hikePercent > 0 ? calculatePercentage(grandTotal, hikePercent) : 0;
    }
  }
  const grandTotalWithHike = roundToPaise(grandTotal + urgentSurcharge);

  return {
    poojaAmount,
    platformFee,
    platformGST,
    kitAmount,
    kitGST,
    grandTotal:          grandTotalWithHike,
    urgentSurcharge,
    urgentHikeType:      urgent ? hikeType : null,
    urgentHikePercent:   urgent ? hikePercent : 0,
    urgentHikeFixed:     urgent ? hikeFixed : 0,
    commissionType,
    commissionPercent,
    commissionFixed,
    gstPercent,
    baseAmount:       poojaAmount,
    commissionAmount: platformFee,
    taxAmount:        kitGST,
    gstAmount:        roundToPaise(platformGST + kitGST),
    kitGstPercent:    gstPercent,
    finalAmount:      grandTotalWithHike,
  };
}

/** Marketplace product line-item tax = unitPrice × quantity × taxRate / 100 */
function calculateItemTax(unitPrice, quantity, taxRate) {
  return calculatePercentage(Number(unitPrice) * Number(quantity), taxRate);
}

module.exports = { roundToPaise, calculatePercentage, calculatePricing, calculateItemTax };
