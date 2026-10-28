import {
  resolveBookingBadge, bookingStatusColor, paymentStatusColor, orderStatusColor,
  formatSlotTime, formatStatus, amtWords, referralUrl, isValidPhone,
} from '../helpers';

describe('resolveBookingBadge (mirrors web PaymentStatusBadge.resolveBookingBadge)', () => {
  it('shows the payment axis while awaiting payment', () => {
    expect(resolveBookingBadge({ status: 'pending_payment', paymentStatus: 'PARTIALLY_PAID' }))
      .toEqual({ value: 'PARTIALLY_PAID', colorMap: paymentStatusColor });
  });

  it('defaults to PENDING when payment status is absent', () => {
    expect(resolveBookingBadge({ status: 'pending_payment' }).value).toBe('PENDING');
  });

  it('shows the lifecycle status once paid', () => {
    expect(resolveBookingBadge({ status: 'pandit_accepted', paymentStatus: 'FULLY_PAID' }))
      .toEqual({ value: 'pandit_accepted', colorMap: bookingStatusColor });
  });

  it('tolerates a missing booking', () => {
    expect(resolveBookingBadge(undefined)).toEqual({ value: undefined, colorMap: bookingStatusColor });
  });
});

describe('formatSlotTime', () => {
  it('zero-pads 24-hour slots', () => {
    expect(formatSlotTime('9:05')).toBe('09:05');
    expect(formatSlotTime('18:30')).toBe('18:30');
    expect(formatSlotTime('7')).toBe('07:00');
  });

  it('returns an empty string for empty input', () => {
    expect(formatSlotTime('')).toBe('');
    expect(formatSlotTime(null)).toBe('');
  });
});

describe('formatStatus', () => {
  it('humanises snake_case statuses', () => {
    expect(formatStatus('pending_reassignment')).toBe('Pending Reassignment');
    expect(formatStatus(undefined)).toBe('');
  });
});

describe('orderStatusColor', () => {
  it('has an explicit colour for every order status the backend can produce, incl. the expired payment_failed', () => {
    for (const s of ['pending_payment', 'paid', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'refunded', 'payment_failed']) {
      expect(orderStatusColor[s]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
    expect(orderStatusColor.payment_failed).toBe(orderStatusColor.cancelled);
    expect(formatStatus('payment_failed')).toBe('Payment Failed');
  });
});

describe('amtWords (invoice amount in words)', () => {
  it.each([
    [0, 'Zero Rupees Only'],
    [1677, 'One Thousand Six Hundred Seventy Seven Rupees Only'],
    [100000, 'One Lakh Rupees Only'],
    [2138.5, 'Two Thousand One Hundred Thirty Eight Rupees and Fifty Paise Only'],
  ])('%p → %p', (n, words) => {
    expect(amtWords(n)).toBe(words);
  });
});

describe('referralUrl', () => {
  it('builds {webUrl}/r/{token} against the test web origin', () => {
    expect(referralUrl('abc123')).toBe('https://web.test.invalid/r/abc123');
  });
});

describe('isValidPhone', () => {
  it('accepts 10-digit Indian mobile numbers starting 6-9', () => {
    expect(isValidPhone('9876543210')).toBe(true);
    expect(isValidPhone('5876543210')).toBe(false);
    expect(isValidPhone('987654321')).toBe(false);
    expect(isValidPhone('98765432100')).toBe(false);
  });
});
