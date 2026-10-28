// Read-only presentation of discounts the SERVER already persisted on a Booking or an Order.
// Nothing here calculates, infers or estimates a discount: a row is offered only when the record itself carries a
// recorded value (Booking: couponCode/couponDiscount/coinCoins/coinValue; Order: couponCode/couponDiscount only —
// the Order schema has no coin fields). Booking.grandTotal and Order.totalAmount are already stored net of these
// discounts, so the totals are shown exactly as persisted and these rows are informational.

const positiveAmount = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

export function getCouponDisplay(record) {
  const code = typeof record?.couponCode === 'string' ? record.couponCode.trim() : '';
  const discount = positiveAmount(record?.couponDiscount);
  if (!code || discount === null) return null;
  return { code, discount };
}

export function getCoinDisplay(record) {
  const coins = positiveAmount(record?.coinCoins);
  const value = positiveAmount(record?.coinValue);
  if (coins === null || value === null) return null;
  return { coins, value };
}
