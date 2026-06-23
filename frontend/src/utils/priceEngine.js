/**
 * Centralized price calculation engine (client-side).
 * Must mirror the logic in backend/src/controllers/booking.controller.js → calculatePricing()
 *
 * Business rule:
 *   - Tax (GST) applies ONLY on kit/product price. Pooja service is tax-exempt.
 *   - Platform fee (convenience fee) is also tax-exempt.
 *
 * Formula:
 *   grandTotal = poojaAmount + platformFee + kitAmount + taxAmount
 *   taxAmount  = kitAmount × gstPercent / 100
 */

export function calculatePrice({
  poojaPrice = 0,
  kitPrice   = 0,
  commissionPercent = 0,
  gstPercent        = 0,
}) {
  const poojaAmount = Math.round(poojaPrice);
  const platformFee = Math.round((poojaPrice * commissionPercent) / 100);
  const kitAmount   = Math.round(kitPrice);
  const taxAmount   = Math.round((kitPrice * gstPercent) / 100);
  const grandTotal  = poojaAmount + platformFee + kitAmount + taxAmount;

  return { poojaAmount, platformFee, kitAmount, taxAmount, grandTotal, commissionPercent, gstPercent };
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
