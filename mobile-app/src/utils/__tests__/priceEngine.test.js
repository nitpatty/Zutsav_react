import { calculatePrice, roundToPaise } from '../priceEngine';

// Expected values are derived by hand from the documented formula (and match the
// worked examples in backend/tests/urgent-pricing.test.js):
//   platformFee = pooja × commission%   platformGST = fee × gst%   kitGST = kit × gst%
//   grandTotal  = pooja + fee + platformGST + kit + kitGST (+ urgent surcharge)
// The Pooja amount itself is never taxed.

const PERCENT_10_GST_18 = { commissionPercent: 10, commissionType: 'percent', gstPercent: 18 };

describe('roundToPaise', () => {
  it('rounds to 2 decimals using half-up, avoiding float noise', () => {
    expect(roundToPaise(35.855)).toBe(35.86); // naive Math.round(x*100)/100 gives 35.85
    expect(roundToPaise(1.005)).toBe(1.01);
    expect(roundToPaise(10)).toBe(10);
  });

  it('treats missing / non-numeric input as 0', () => {
    expect(roundToPaise(undefined)).toBe(0);
    expect(roundToPaise(null)).toBe(0);
    expect(roundToPaise('abc')).toBe(0);
    expect(roundToPaise(NaN)).toBe(0);
  });

  it('accepts numeric strings', () => {
    expect(roundToPaise('99.999')).toBe(100);
  });
});

describe('calculatePrice', () => {
  it('returns all-zero pricing when called with no amounts', () => {
    const p = calculatePrice({});
    expect(p).toMatchObject({
      poojaAmount: 0, platformFee: 0, platformGST: 0,
      kitAmount: 0, kitGST: 0, grandTotal: 0, urgentSurcharge: 0,
    });
  });

  it('percent commission: ₹1500 pooja, 10% fee, 18% GST on the fee only', () => {
    const p = calculatePrice({ poojaPrice: 1500, ...PERCENT_10_GST_18 });
    expect(p.poojaAmount).toBe(1500);
    expect(p.platformFee).toBe(150);
    expect(p.platformGST).toBe(27);
    expect(p.grandTotal).toBe(1677);
  });

  it('never charges GST on the pooja amount itself', () => {
    const p = calculatePrice({ poojaPrice: 1000, commissionPercent: 0, gstPercent: 18 });
    expect(p.platformFee).toBe(0);
    expect(p.platformGST).toBe(0);
    expect(p.grandTotal).toBe(1000);
  });

  it('fixed commission ignores commissionPercent', () => {
    const p = calculatePrice({
      poojaPrice: 1000, commissionType: 'fixed', commissionFixed: 100,
      commissionPercent: 50, gstPercent: 18,
    });
    expect(p.platformFee).toBe(100);
    expect(p.platformGST).toBe(18);
    expect(p.grandTotal).toBe(1118);
  });

  it('adds kit amount plus 18% kit GST', () => {
    const p = calculatePrice({ poojaPrice: 1500, kitPrice: 200, ...PERCENT_10_GST_18 });
    expect(p.kitAmount).toBe(200);
    expect(p.kitGST).toBe(36);
    expect(p.taxAmount).toBe(36); // backward-compat alias of kitGST
    expect(p.grandTotal).toBe(1500 + 150 + 27 + 200 + 36);
  });

  it('rounds each component to the paisa', () => {
    // fee = 999 × 7.5% = 74.925 → 74.93 ; GST = 74.93 × 18% = 13.4874 → 13.49
    const p = calculatePrice({ poojaPrice: 999, commissionPercent: 7.5, gstPercent: 18 });
    expect(p.platformFee).toBe(74.93);
    expect(p.platformGST).toBe(13.49);
    expect(p.grandTotal).toBe(1087.42);
  });

  describe('urgent surcharge', () => {
    // Backend example: pooja ₹2000, 5% fee, 18% GST → gross 2118; 1% urgent → +₹20 (on pooja only).
    const base = { poojaPrice: 2000, commissionPercent: 5, gstPercent: 18 };

    it('normal booking is unaffected even when a hike is configured', () => {
      const p = calculatePrice({ ...base, urgent: false, urgentHikePercent: 1 });
      expect(p.grandTotal).toBe(2118);
      expect(p.urgentSurcharge).toBe(0);
      expect(p.urgentHikeType).toBeNull();
    });

    it('percent hike applies to the pooja base only', () => {
      const p = calculatePrice({ ...base, urgent: true, urgentHikeType: 'percent', urgentHikePercent: 1 });
      expect(p.urgentSurcharge).toBe(20); // not 1% of 2118
      expect(p.grandTotal).toBe(2138);
      expect(p.platformFee).toBe(100);    // fee/GST are not scaled by the hike
    });

    it('fixed hike is added as-is', () => {
      const p = calculatePrice({ ...base, urgent: true, urgentHikeType: 'fixed', urgentHikeFixed: 150 });
      expect(p.urgentSurcharge).toBe(150);
      expect(p.grandTotal).toBe(2268);
    });

    it('urgent with a zero / unset hike adds nothing', () => {
      const p = calculatePrice({ ...base, urgent: true });
      expect(p.urgentSurcharge).toBe(0);
      expect(p.grandTotal).toBe(2118);
    });
  });
});
