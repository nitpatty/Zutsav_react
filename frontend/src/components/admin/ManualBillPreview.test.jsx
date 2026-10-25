import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ManualBillPreview from './ManualBillPreview';

// Shapes mirror POST /admin/manual-billing/preview.
const haldiLine = (taxApplied) => ({
  lineType: 'product', name: 'Haldi', variantLabel: '50g', quantity: 1, unitPrice: 150, discount: 0,
  taxRate: taxApplied ? 4.5 : 0, taxAmount: taxApplied ? 6.75 : 0, lineTotal: taxApplied ? 156.75 : 150,
});

const previewFor = (taxApplied, overrides = {}) => ({
  taxApplied,
  registration: { state: 'Delhi' },
  lines: [haldiLine(taxApplied)],
  totals: {
    grossTotal: 150, discountTotal: 0, taxableValue: 150,
    totalTax: taxApplied ? 6.75 : 0, grandTotal: taxApplied ? 156.75 : 150,
  },
  taxBreakdown: taxApplied ? [{ rate: 4.5, taxableValue: 150, taxAmount: 6.75 }] : [],
  gstBreakdown: taxApplied
    ? { igst: 0, cgst: 3.38, sgst: 3.37, isInterstate: false }
    : { igst: 0, cgst: 0, sgst: 0, isInterstate: false },
  ...overrides,
});

const render = (props) => renderToStaticMarkup(
  <ManualBillPreview hasLines customerState="Delhi" {...props} />
);

const itemsSection = (html) => html.slice(
  html.indexOf('data-testid="preview-items"'),
  html.indexOf('data-testid="preview-summary"')
);

describe('ManualBillPreview', () => {
  it('tax OFF: shows base price and an untaxed grand total, with the toggle off', () => {
    const html = render({ preview: previewFor(false), applyTax: false });
    expect(html).toContain('Haldi (50g)');
    expect(html).toContain('1 × ₹150');
    expect(html).toContain('data-testid="preview-grand-total">₹150<');
    expect(html).toContain('data-testid="preview-tax">₹0<');
    expect(html).not.toContain('156.75');
    expect(html).not.toContain('CGST');
    expect(html).toMatch(/aria-label="Apply tax"/);
    expect(html).not.toMatch(/aria-label="Apply tax"[^>]*checked/);
  });

  it('tax ON: tax appears once in the summary and the grand total includes it', () => {
    const html = render({ preview: previewFor(true), applyTax: true });
    expect(html).toContain('data-testid="preview-tax">₹6.75<');
    expect(html).toContain('data-testid="preview-grand-total">₹156.75<');
    expect(html).toContain('Tax (4.5%)');
    // ₹6.75 is rendered exactly once — not beside the item as well.
    expect(html.split('₹6.75').length - 1).toBe(1);
    expect(html).toMatch(/checked/);
  });

  it('never renders per-item tax labels or amounts in the item list', () => {
    for (const on of [true, false]) {
      const items = itemsSection(render({ preview: previewFor(on), applyTax: on }));
      expect(items).toContain('Haldi');
      expect(items).toContain('₹150');
      expect(items.toLowerCase()).not.toContain('tax');
      expect(items).not.toContain('4.5%');
      expect(items).not.toContain('6.75');
      expect(items).not.toContain('156.75');
    }
  });

  it('shows a rate-wise breakdown in the summary only for mixed rates', () => {
    const mixed = previewFor(true, {
      lines: [haldiLine(true), { ...haldiLine(true), name: 'Ghee', taxRate: 12, taxAmount: 18 }],
      totals: { grossTotal: 300, discountTotal: 0, taxableValue: 300, totalTax: 24.75, grandTotal: 324.75 },
      taxBreakdown: [
        { rate: 4.5, taxableValue: 150, taxAmount: 6.75 },
        { rate: 12, taxableValue: 150, taxAmount: 18 },
      ],
    });
    const html = render({ preview: mixed, applyTax: true });
    expect(html).toContain('4.5%: ₹6.75 · 12%: ₹18');
    expect(html).not.toContain('Tax (');
    expect(itemsSection(html).toLowerCase()).not.toContain('tax');
  });

  it('labels kit and custom lines and shows discounts without tax detail', () => {
    const preview = previewFor(false, {
      lines: [
        { lineType: 'kit', name: 'Havan Kit', variantLabel: 'Kit (3 items)', quantity: 2, unitPrice: 500, discount: 0, taxRate: 0, taxAmount: 0, lineTotal: 1000 },
        { lineType: 'custom', name: 'Loose Flowers', variantLabel: 'fresh', unit: 'kg', quantity: 1, unitPrice: 40, discount: 5, taxRate: 0, taxAmount: 0, lineTotal: 35 },
      ],
      totals: { grossTotal: 1040, discountTotal: 5, taxableValue: 1035, totalTax: 0, grandTotal: 1035 },
    });
    const items = itemsSection(render({ preview, applyTax: false }));
    expect(items).toContain('Havan Kit');
    expect(items).toContain('>Kit<');
    expect(items).toContain('Loose Flowers (fresh)');
    expect(items).toContain('>Custom<');
    expect(items).toContain('1 × ₹40 / kg');
    expect(items).toContain('Discount −₹5');
  });

  it('keeps the toggle available when the preview errors, and dims a stale summary', () => {
    const errored = render({ preview: null, previewError: 'Line 1: needs an explicit tax rate', applyTax: true });
    expect(errored).toContain('needs an explicit tax rate');
    expect(errored).toMatch(/aria-label="Apply tax"/);
    expect(errored).not.toContain('preview-grand-total');

    const stale = render({ preview: previewFor(false), applyTax: true, fresh: false });
    expect(stale).toContain('opacity:0.55');
    const fresh = render({ preview: previewFor(false), applyTax: false, fresh: true });
    expect(fresh).toContain('opacity:1');
  });

  it('prompts for items when the bill is empty', () => {
    const html = renderToStaticMarkup(<ManualBillPreview hasLines={false} applyTax={false} />);
    expect(html).toContain('Add at least one item');
    expect(html).not.toContain('Apply tax');
  });
  describe('manual tax percentage', () => {
    // Gross 5150, discount 2000, base 3150, 5% → 157.50 → 3307.50 (server response shape).
    const manual = (overrides = {}) => ({
      taxApplied: true, taxMode: 'manual_bill_rate', manualTaxRate: 5,
      registration: { state: 'Delhi' },
      lines: [{ lineType: 'product', name: 'Puja Set', variantLabel: '', quantity: 3, unitPrice: 1000, discount: 2000, taxRate: 5, taxAmount: 157.5, lineTotal: 1157.5 },
              { lineType: 'custom', name: 'Extras', variantLabel: '', quantity: 1, unitPrice: 2150, discount: 0, taxRate: 5, taxAmount: 0, lineTotal: 2150 }],
      totals: { grossTotal: 5150, discountTotal: 2000, taxableValue: 3150, totalTax: 157.5, grandTotal: 3307.5 },
      taxBreakdown: [{ rate: 5, taxableValue: 3150, taxAmount: 157.5 }],
      gstBreakdown: { igst: 0, cgst: 78.75, sgst: 78.75, isInterstate: false },
      ...overrides,
    });

    it('shows the editable percentage input only while tax is ON', () => {
      const on = render({ preview: manual(), applyTax: true, taxRate: '5' });
      expect(on).toMatch(/aria-label="Tax Rate \(%\)"/);
      expect(on).toContain('value="5"');
      const off = render({ preview: previewFor(false), applyTax: false, taxRate: '5' });
      expect(off).not.toContain('Tax Rate (%)');
    });

    it('displays the applied percentage beside the tax amount and the updated grand total', () => {
      const html = render({ preview: manual(), applyTax: true, taxRate: '5' });
      expect(html).toContain('Tax (5%)');
      expect(html).toContain('data-testid="preview-tax">₹157.50<');
      expect(html).toContain('data-testid="preview-grand-total">₹3,307.50<');
      expect(html).toContain('Subtotal');
      expect(html).toContain('−₹2,000');
      expect(html.split('₹157.50').length - 1).toBe(1); // tax amount shown once
    });

    it('labels the percentage the SERVER applied, not the half-typed input', () => {
      const html = render({ preview: manual(), applyTax: true, taxRate: '1', fresh: false });
      expect(html).toContain('Tax (5%)');
      expect(html).toContain('value="1"');
      expect(html).toContain('opacity:0.55');
    });

    it('never shows per-item tax in the item list under a manual rate', () => {
      const items = itemsSection(render({ preview: manual(), applyTax: true, taxRate: '5' }));
      expect(items).toContain('Puja Set');
      expect(items.toLowerCase()).not.toContain('tax');
      expect(items).not.toContain('5%');
      expect(items).not.toContain('157.50');
    });

    it('shows a validation message and no stale tax label for a missing percentage', () => {
      const html = render({
        preview: previewFor(false), applyTax: true, taxRate: '', fresh: false,
        taxRateError: 'Enter the tax percentage',
      });
      expect(html).toContain('role="alert"');
      expect(html).toContain('Enter the tax percentage');
      expect(html).toContain('aria-invalid="true"');
      expect(html).not.toContain('Tax (');
    });
  });
});
