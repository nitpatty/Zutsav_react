import { readBookingCharge } from '../bookingCharge';

const LINK = 'https://pay.example.invalid/redirect/x';

describe('readBookingCharge (POST /bookings/create-phonepe-order response)', () => {
  it('a payment link with a positive finite chargeAmount is payable for exactly that amount', () => {
    expect(readBookingCharge({ redirectUrl: LINK, chargeAmount: 750 })).toEqual({ kind: 'pay', chargeAmount: 750 });
    expect(readBookingCharge({ redirectUrl: LINK, chargeAmount: 0.5 })).toEqual({ kind: 'pay', chargeAmount: 0.5 });
  });

  it.each([undefined, null, 0, -1, NaN, Infinity, '750', '', {}, []])('a payment link with chargeAmount %p is invalid', (amount) => {
    expect(readBookingCharge({ redirectUrl: LINK, chargeAmount: amount })).toEqual({ kind: 'invalid' });
  });

  it('only an explicit paidWithCoins === true with no payment link is settled', () => {
    expect(readBookingCharge({ paidWithCoins: true })).toEqual({ kind: 'settled' });
    expect(readBookingCharge({ paidWithCoins: true, chargeAmount: 0 })).toEqual({ kind: 'settled' });
  });

  it.each([{}, { paidWithCoins: false }, { paidWithCoins: 'true' }, { paidWithCoins: 1 }, { chargeAmount: 0 }, { chargeAmount: 500 }])(
    'no payment link without paidWithCoins === true is invalid: %j',
    (data) => {
      expect(readBookingCharge(data)).toEqual({ kind: 'invalid' });
    },
  );

  it('paidWithCoins does not override a payment link that lacks a valid amount', () => {
    expect(readBookingCharge({ redirectUrl: LINK, paidWithCoins: true })).toEqual({ kind: 'invalid' });
  });

  it.each([undefined, null, 'ok', 5])('a non-object response (%p) is invalid', (data) => {
    expect(readBookingCharge(data)).toEqual({ kind: 'invalid' });
  });

  it('an empty-string payment link counts as no link', () => {
    expect(readBookingCharge({ redirectUrl: '', chargeAmount: 100 })).toEqual({ kind: 'invalid' });
  });
});
