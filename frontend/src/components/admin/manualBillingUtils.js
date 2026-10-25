// Pure helpers for the Manual Billing form. The server re-validates everything
// here (backend/src/utils/manualBillCalculator.js) — these checks only give the
// admin immediate feedback and keep obviously malformed requests off the wire.

export const MAX_QTY = 10000;
export const MAX_UNIT_PRICE = 10000000;
export const MONEY_RE = /^\d{1,8}(\.\d{1,2})?$/;
export const PERCENT_RE = /^\d{1,3}(\.\d{1,2})?$/;

export const EMPTY_CUSTOM_DRAFT = {
  name: '', description: '', sku: '', unit: '', quantity: '1', unitPrice: '',
};

export const isMoney = (v) => MONEY_RE.test(String(v ?? '').trim())
  && Number(String(v).trim()) <= MAX_UNIT_PRICE;

export const isPercent = (v) => PERCENT_RE.test(String(v ?? '').trim())
  && Number(String(v).trim()) <= 100;

/** @returns {Object<string,string>} field → message; empty object when valid */
export function validateCustomDraft(draft) {
  const d = draft || {};
  const errors = {};
  const name = String(d.name ?? '').trim();
  if (!name) errors.name = 'Item name is required';
  else if (name.length > 200) errors.name = 'Item name must be at most 200 characters';

  if (String(d.description ?? '').trim().length > 200) errors.description = 'At most 200 characters';
  if (String(d.sku ?? '').trim().length > 64) errors.sku = 'At most 64 characters';
  if (String(d.unit ?? '').trim().length > 20) errors.unit = 'At most 20 characters';

  const qty = String(d.quantity ?? '').trim();
  if (!/^\d+$/.test(qty) || Number(qty) < 1 || Number(qty) > MAX_QTY) {
    errors.quantity = `Whole number between 1 and ${MAX_QTY}`;
  }

  const price = String(d.unitPrice ?? '').trim();
  if (!price) errors.unitPrice = 'Unit price is required';
  else if (!isMoney(price)) errors.unitPrice = 'Enter an amount of 0 or more with at most 2 decimals';
  return errors;
}

/**
 * Validate the bill-level tax percentage the admin typed (same range/precision
 * the server enforces: 0–100, at most 2 decimals). Returns '' when valid.
 */
export function validateTaxRate(value) {
  const v = String(value ?? '').trim();
  if (!v) return 'Enter the tax percentage';
  if (!isPercent(v)) return 'Enter a percentage from 0 to 100 (up to 2 decimals)';
  return '';
}

/** Build the line state for a validated custom draft. */
export function customLineFromDraft(draft, key) {
  const d = draft;
  return {
    key,
    type: 'custom',
    custom: {
      name: d.name.trim(),
      description: String(d.description ?? '').trim(),
      sku: String(d.sku ?? '').trim(),
      unit: String(d.unit ?? '').trim(),
    },
    unitPrice: String(d.unitPrice).trim(),
    quantity: String(d.quantity).trim(),
    discount: '',
  };
}

const discountOf = (l) => (l.discount === '' ? 0 : Number(l.discount) || 0);

/**
 * Request line for the server. Catalog lines carry identifiers + quantity +
 * discount ONLY — prices and tax rates are never sent for products or kits.
 */
export function lineToPayload(l) {
  const base = { quantity: Number(l.quantity), discount: discountOf(l) };
  if (l.type === 'kit') return { type: 'kit', kitId: l.kit._id, ...base };
  if (l.type === 'custom') {
    return {
      type: 'custom',
      name: l.custom.name,
      description: l.custom.description,
      sku: l.custom.sku,
      unit: l.custom.unit,
      unitPrice: String(l.unitPrice).trim(),
      ...base,
    };
  }
  return {
    type: 'product',
    productId: l.product._id,
    ...(l.variantId ? { variantId: l.variantId } : {}),
    ...base,
  };
}

/** Existing line that a repeat add should merge into (null → add a new line). */
export function findMergeTarget(lines, type, id) {
  return lines.find((l) => {
    if (l.type !== type) return false;
    if (type === 'kit') return l.kit._id === id;
    // Variant products pick their variant per line, so repeats stay separate.
    return l.product._id === id && !(l.product.variants || []).length;
  }) || null;
}
