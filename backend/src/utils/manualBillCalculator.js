/**
 * Manual (offline product-sale) bill calculation engine.
 *
 * Deliberately ISOLATED from the booking/pooja pricing engine:
 *   - No platform commission, platform GST, kit GST, urgent surcharge,
 *     Pooja exemptions, coupons, coins, referral or loyalty logic.
 *   - Never calls financeUtils.calculatePricing().
 *
 * Reuses only the shared generic primitives:
 *   roundToPaise, calculatePercentage, calculateItemTax  (financeUtils)
 *
 * The server is the ONLY authority for prices, tax rates and totals. Clients
 * submit catalog identifiers, quantities and an optional manual discount;
 * every monetary value below is re-derived from the live catalog.
 */

const Product = require('../models/Product');
const { roundToPaise, calculatePercentage, calculateItemTax } = require('./financeUtils');

class ManualBillValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'ManualBillValidationError';
    this.status = 400;
    this.statusCode = 400;
    this.details = details;
  }
}

const MAX_LINES     = 100;
const MAX_QTY_LINE  = 10000;
const STATE_ALIASES = {
  delhi: 'delhi',
  newdelhi: 'delhi',
  uttarpradesh: 'uttarpradesh',
  up: 'uttarpradesh',
  'uttar pradesh': 'uttarpradesh',
};

function normalizeState(value) {
  const s = String(value || '').toLowerCase().replace(/\s+/g, '');
  return STATE_ALIASES[s] || s;
}

/** IGST when the customer state differs from the seller's registered state. */
function buildBillGstBreakdown(totalGST, customerState, sellerState) {
  const customer = normalizeState(customerState);
  const seller   = normalizeState(sellerState);
  const isInterstate = Boolean(customer) && Boolean(seller) && customer !== seller;
  return isInterstate
    ? { igst: roundToPaise(totalGST), cgst: 0, sgst: 0, isInterstate: true }
    : {
        igst: 0,
        cgst: roundToPaise(Number(totalGST || 0) / 2),
        sgst: roundToPaise(Number(totalGST || 0) / 2),
        isInterstate: false,
      };
}

function resolveUnitPrice(product, variant) {
  const source = variant || product;
  const sale   = source.salePrice;
  if (sale !== null && sale !== undefined && Number(sale) > 0 && Number(sale) < Number(source.price)) {
    return roundToPaise(sale);
  }
  return roundToPaise(source.price);
}

/**
 * Validate + price the requested lines against the live catalog.
 *
 * @param {Array<{productId:string, variantId?:string, quantity:number, discount?:number}>} items
 * @returns {Promise<{lines:Array, grossTotal:number, discountTotal:number, taxableValue:number, totalTax:number, grandTotal:number}>}
 * @throws {ManualBillValidationError}
 */
async function calculateManualBillLines(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ManualBillValidationError('At least one product line is required');
  }
  if (items.length > MAX_LINES) {
    throw new ManualBillValidationError(`A manual bill supports at most ${MAX_LINES} lines`);
  }

  const errors = [];
  const clean = [];

  items.forEach((raw, index) => {
    const item = raw && typeof raw === 'object' ? raw : {};
    const productId = String(item.productId || '').trim();
    const variantId = item.variantId != null && item.variantId !== '' ? String(item.variantId) : null;
    const quantity  = Number(item.quantity);
    const discount  = item.discount === undefined || item.discount === null || item.discount === ''
      ? 0
      : Number(item.discount);

    if (!productId || !/^[a-f0-9]{24}$/i.test(productId)) {
      errors.push(`Line ${index + 1}: a valid productId is required`);
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY_LINE) {
      errors.push(`Line ${index + 1}: quantity must be a whole number between 1 and ${MAX_QTY_LINE}`);
      return;
    }
    if (!Number.isFinite(discount) || discount < 0) {
      errors.push(`Line ${index + 1}: discount must be a non-negative number`);
      return;
    }
    clean.push({ index, productId, variantId, quantity, discount });
  });

  if (errors.length) throw new ManualBillValidationError('Invalid bill lines', errors);

  const products = await Product.find({
    _id: { $in: clean.map((c) => c.productId) },
    isDeleted: { $ne: true },
    isActive: true,
  }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const lines = [];
  for (const c of clean) {
    const product = byId.get(c.productId);
    if (!product) {
      errors.push(`Line ${c.index + 1}: product not found or is not active`);
      continue;
    }

    let variant = null;
    if (c.variantId) {
      variant = (product.variants || []).find((v) => String(v.variantId) === c.variantId) || null;
      if (!variant) {
        errors.push(`Line ${c.index + 1}: variant not found for this product`);
        continue;
      }
      if (variant.isActive === false) {
        errors.push(`Line ${c.index + 1}: variant is not active`);
        continue;
      }
    } else if (Array.isArray(product.variants) && product.variants.length > 0) {
      errors.push(`Line ${c.index + 1}: a variant must be selected for this product`);
      continue;
    }

    const unitPrice = resolveUnitPrice(product, variant);
    const gross     = roundToPaise(unitPrice * c.quantity);
    if (c.discount > gross) {
      errors.push(`Line ${c.index + 1}: discount cannot exceed the line gross amount`);
      continue;
    }
    const taxable   = roundToPaise(gross - c.discount);
    const taxRate   = Math.min(100, Math.max(0, Number(product.taxRate) || 0));
    const taxAmount = calculateItemTax(taxable, 1, taxRate); // taxable × taxRate / 100
    const lineTotal = roundToPaise(taxable + taxAmount);

    lines.push({
      productId:    product._id,
      variantId:    variant ? String(variant.variantId) : null,
      name:         product.name,
      variantLabel: variant ? String(variant.quantity || '') : '',
      sku:          variant ? String(variant.sku || '') : String(product.sku || ''),
      hsn:          '', // no HSN/SAC field on Product yet — never invented
      quantity:     c.quantity,
      unitPrice,
      discount:     roundToPaise(c.discount),
      taxRate,
      taxAmount,
      lineTotal,
    });
  }

  if (errors.length) throw new ManualBillValidationError('Invalid bill lines', errors);
  if (lines.length === 0) throw new ManualBillValidationError('At least one valid product line is required');

  return finalizeTotals(lines);
}

/** Deterministic totals from already-priced lines. */
function finalizeTotals(lines) {
  const grossTotal    = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const discountTotal = lines.reduce((s, l) => s + l.discount, 0);
  const taxableValue  = lines.reduce((s, l) => s + (l.unitPrice * l.quantity - l.discount), 0);
  const totalTax      = lines.reduce((s, l) => s + l.taxAmount, 0);
  const grandTotal    = lines.reduce((s, l) => s + l.lineTotal, 0);

  return {
    lines,
    grossTotal:    roundToPaise(grossTotal),
    discountTotal: roundToPaise(discountTotal),
    taxableValue:  roundToPaise(taxableValue),
    totalTax:      roundToPaise(totalTax),
    grandTotal:    roundToPaise(grandTotal),
  };
}

/** Full result used by preview + finalize: lines, totals and GST split. */
function buildManualBill({ computedLines, customerState, sellerState }) {
  const totals = finalizeTotals(computedLines);
  const gstBreakdown = buildBillGstBreakdown(totals.totalTax, customerState, sellerState);
  return { ...totals, gstBreakdown };
}

module.exports = {
  ManualBillValidationError,
  calculateManualBillLines,
  finalizeTotals,
  buildBillGstBreakdown,
  buildManualBill,
  normalizeState,
  MAX_LINES,
  MAX_QTY_LINE,
};
