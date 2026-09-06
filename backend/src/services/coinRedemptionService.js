/**
 * Coin Redemption Service — shared coin-redemption rules + settlement.
 *
 * Used by BOTH checkout flows (single-booking `/bookings/create-phonepe-order`
 * and cart `/checkout/cart`):
 *  - resolveCoinRedemption(): server-authoritative validation that a Pooja-only
 *    redemption is eligible (minimum-balance threshold, coupon exclusivity,
 *    balance cap, payable cap) and computes the exact coins/money to apply.
 *  - settleCoinRedemption(): debits the user's wallet with a COIN_REDEMPTION
 *    ledger entry exactly once per merchant transaction (idempotent via the
 *    wallet ledger's unique idempotencyKey). Called ONLY after payment succeeds.
 *
 * Admin config (System Settings → Wallet / Coins):
 *  - coinMonetaryValue       ₹ per coin; null = not configured
 *  - coinRedemptionMinCoins  minimum wallet balance required before redemption
 *    becomes available (eligibility threshold, not a per-transaction minimum)
 */

const settings = require('../utils/settingsService');
const walletService = require('./walletService');

/**
 * Validate + compute a coin redemption against a payable amount.
 *
 * Rules enforced server-side (never trust the client):
 *  - Pooja bookings only (marketplace/cart products are not eligible)
 *  - Mutually exclusive with coupon codes
 *  - Wallet balance must meet coinRedemptionMinCoins (eligibility threshold)
 *  - Redeemed coins never exceed the wallet balance nor the payable amount
 *
 * @param {Object}   params
 * @param {ObjectId} params.userId
 * @param {number}   [params.coinCoins]    Coins requested by the client
 * @param {boolean}  [params.hasCoupon]    Whether a coupon code is present
 * @param {Array}    [params.productItems] Non-Pooja items in the cart
 * @param {number}   [params.payable]      Payable amount (after coupon discount)
 * @returns {Promise<{requested:number, coinCoinsUsed:number, coinValueUsed:number}>}
 * @throws {Error & {status:number}} On any rule violation
 */
async function resolveCoinRedemption({ userId, coinCoins, hasCoupon = false, productItems = [], payable = 0 }) {
  const requested = Math.floor(Number(coinCoins) || 0);
  if (requested <= 0) return { requested, coinCoinsUsed: 0, coinValueUsed: 0 };

  if (hasCoupon) {
    throw Object.assign(new Error('Coupon code and coin redemption cannot be used together'), { status: 400 });
  }
  if (Array.isArray(productItems) && productItems.length > 0) {
    throw Object.assign(new Error('Coin redemption is only available for Pooja bookings'), { status: 400 });
  }
  if (!(payable > 0)) {
    throw Object.assign(new Error('Coin redemption is only available for Pooja bookings'), { status: 400 });
  }

  const rate = Number(await settings.get('coinMonetaryValue', null));
  if (isNaN(rate) || rate <= 0) {
    throw Object.assign(new Error('Coin value is not configured yet. Please try again later'), { status: 400 });
  }

  const minCoins = Math.floor(Number(await settings.get('coinRedemptionMinCoins', 0)) || 0);
  const wallet = await walletService.getOrCreateWallet(userId);
  if (wallet.balance < minCoins) {
    throw Object.assign(
      new Error(`Coin redemption requires a minimum of ${minCoins} coins in your wallet. Your balance is ${wallet.balance} coins`),
      { status: 400 }
    );
  }
  if (requested > wallet.balance) {
    throw Object.assign(new Error(`You can redeem up to ${wallet.balance} coins`), { status: 400 });
  }

  // Cap to the payable so we never credit more money than is owed.
  const maxAffordable = Math.floor(payable / rate);
  const coinCoinsUsed = Math.min(requested, wallet.balance, maxAffordable);
  const coinValueUsed = Math.round(coinCoinsUsed * rate * 100) / 100;

  if (coinCoinsUsed <= 0 || coinValueUsed <= 0) {
    throw Object.assign(new Error('Selected coins do not cover any part of the payable amount'), { status: 400 });
  }

  return { requested, coinCoinsUsed, coinValueUsed };
}

/**
 * Debit the user's wallet for coin redemptions carried on paid bookings.
 * Idempotent per merchant transaction — safe to call from both the verify
 * endpoint and the PhonePe webhook for the same checkout.
 *
 * @param {Array} bookings - Booking docs that carried coinCoins/coinValue
 * @returns {Promise<boolean>} true when a debit was settled
 */
async function settleCoinRedemption(bookings) {
  const list = (Array.isArray(bookings) ? bookings : []).filter(Boolean);
  const totalCoins = list.reduce((sum, b) => sum + (Number(b.coinCoins) || 0), 0);
  if (totalCoins <= 0) return false;

  const first = list[0];
  if (!first?.userId || !first?.phonePeMerchantTransactionId) return false;

  await walletService.debit({
    userId: first.userId,
    amount: totalCoins,
    type: 'COIN_REDEMPTION',
    description: `Coin value applied to order ${first.phonePeMerchantTransactionId}`,
    reference: { type: 'BOOKING', id: first._id },
    idempotencyKey: `COIN_REDEMPTION_${first.phonePeMerchantTransactionId}`,
  });
  return true;
}

module.exports = { resolveCoinRedemption, settleCoinRedemption };