import {
  validateCustomDraft, validateTaxRate, lineToPayload, customLineFromDraft, findMergeTarget, EMPTY_CUSTOM_DRAFT,
} from './manualBillingUtils';

const draft = (o = {}) => ({ ...EMPTY_CUSTOM_DRAFT, name: 'Haldi', description: '50g', unitPrice: '150', ...o });

describe('validateCustomDraft', () => {
  it('accepts a minimal valid draft and a fully populated one', () => {
    expect(validateCustomDraft(draft())).toEqual({});
    expect(validateCustomDraft(draft({ sku: 'H-50', unit: 'pack', quantity: '12', unitPrice: '0' }))).toEqual({});
  });

  it('requires name, quantity and unit price', () => {
    const e = validateCustomDraft({ ...EMPTY_CUSTOM_DRAFT, quantity: '' });
    expect(Object.keys(e).sort()).toEqual(['name', 'quantity', 'unitPrice']);
  });

  it.each([
    ['quantity', '0'], ['quantity', '-2'], ['quantity', '1.5'], ['quantity', 'abc'], ['quantity', '10001'],
    ['unitPrice', '-1'], ['unitPrice', '1e3'], ['unitPrice', '10.999'], ['unitPrice', 'abc'], ['unitPrice', '100000000'],
  ])('rejects %s = %s', (field, value) => {
    expect(validateCustomDraft(draft({ [field]: value }))[field]).toBeTruthy();
  });

  it('enforces text length limits', () => {
    expect(validateCustomDraft(draft({ name: 'x'.repeat(201) })).name).toBeTruthy();
    expect(validateCustomDraft(draft({ description: 'x'.repeat(201) })).description).toBeTruthy();
    expect(validateCustomDraft(draft({ sku: 'x'.repeat(65) })).sku).toBeTruthy();
    expect(validateCustomDraft(draft({ unit: 'x'.repeat(21) })).unit).toBeTruthy();
  });
});

describe('lineToPayload', () => {
  it('sends identifiers only for products and kits — never prices or tax rates', () => {
    const product = lineToPayload({
      type: 'product', product: { _id: 'p1', price: 1, taxRate: 99 }, variantId: 'v1', quantity: '2', discount: '',
    });
    expect(product).toEqual({ type: 'product', productId: 'p1', variantId: 'v1', quantity: 2, discount: 0 });

    const kit = lineToPayload({ type: 'kit', kit: { _id: 'k1', price: 1, taxRate: 99 }, quantity: '3', discount: '5' });
    expect(kit).toEqual({ type: 'kit', kitId: 'k1', quantity: 3, discount: 5 });
  });

  it('sends the typed price for custom lines and no per-line tax rate', () => {
    const line = customLineFromDraft(draft({ quantity: '2' }), 'k');
    expect(lineToPayload(line)).toEqual({
      type: 'custom', name: 'Haldi', description: '50g', sku: '', unit: '',
      unitPrice: '150', quantity: 2, discount: 0,
    });
  });
});

describe('validateTaxRate', () => {
  it.each(['0', '5', '12', '18', '4.5', '99.99', '100', ' 7.25 '])('accepts %s', (v) => {
    expect(validateTaxRate(v)).toBe('');
  });
  it.each(['', '   ', 'abc', '-1', '100.01', '101', '5.555', '5%', '1e1', '--5'])('rejects "%s"', (v) => {
    expect(validateTaxRate(v)).not.toBe('');
  });
  it('treats a missing value as required rather than defaulting', () => {
    expect(validateTaxRate(undefined)).toMatch(/Enter the tax percentage/);
    expect(validateTaxRate(null)).toMatch(/Enter the tax percentage/);
  });
});

describe('findMergeTarget', () => {
  const lines = [
    { key: 'a', type: 'product', product: { _id: 'p1', variants: [] } },
    { key: 'b', type: 'product', product: { _id: 'p2', variants: [{ variantId: 'v' }] } },
    { key: 'c', type: 'kit', kit: { _id: 'k1' } },
  ];
  it('merges repeat kits and variant-less products only', () => {
    expect(findMergeTarget(lines, 'product', 'p1').key).toBe('a');
    expect(findMergeTarget(lines, 'kit', 'k1').key).toBe('c');
    expect(findMergeTarget(lines, 'product', 'p2')).toBeNull(); // variant products stay separate
    expect(findMergeTarget(lines, 'product', 'k1')).toBeNull();
  });
});
