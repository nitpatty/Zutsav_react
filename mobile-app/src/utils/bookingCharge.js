// Reads the response of POST /api/bookings/create-phonepe-order. The server is the only authority on what is charged;
// the app never substitutes its own estimate. Contract (backend/src/controllers/booking.controller.js createPhonePeBooking):
//   gateway payment  → 201 { success, booking, redirectUrl, merchantTransactionId, chargeAmount, remainingAmount, … }
//                      chargeAmount is the amount sent to PhonePe: the full payable, or the partial amount (> 0)
//   fully coin-covered → 201 { success, booking, paidWithCoins: true, merchantTransactionId, coinCoinsUsed, coinValueUsed }
//                      no redirectUrl and no chargeAmount: nothing is charged and the server settles the booking inline
//
// A zero or missing chargeAmount WITH a payment link is not a contract-supported state, so it is `invalid` (never
// quietly replaced by a local figure, and never a reason to open PhonePe).
//   pay      → { kind: 'pay', chargeAmount }   a payment link and a finite chargeAmount > 0
//   settled  → { kind: 'settled' }             the explicit paidWithCoins === true result, with no payment link
//   invalid  → { kind: 'invalid' }             anything else; the booking (if any) still exists on the server
const isPositiveAmount = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

export function readBookingCharge(data) {
  if (!data || typeof data !== 'object') return { kind: 'invalid' };
  const hasLink = typeof data.redirectUrl === 'string' && data.redirectUrl.length > 0;
  if (hasLink) return isPositiveAmount(data.chargeAmount) ? { kind: 'pay', chargeAmount: data.chargeAmount } : { kind: 'invalid' };
  return data.paidWithCoins === true ? { kind: 'settled' } : { kind: 'invalid' };
}
