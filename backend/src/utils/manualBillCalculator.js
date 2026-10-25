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
 * The server is the ONLY authority for prices, tax rates and totals. Three
 * line types are supported:
 *   product — marketplace product (+variant); price and tax rate come from the DB
 *   kit     — active Kit; price (`discountPrice`) and tax rate come from the DB
 *   custom  — free-form line typed by the admin. The admin supplies the unit
 *             price (and an explicit tax rate when tax is applied); nothing is
 *             read from or written to the catalog.
 *
 * Tax modes (see resolveTaxPolicy):
 *   none             — applyTax:false. Tax is 0 whatever else the client sent.
 *   manual_bill_rate — applyTax:true + manualTaxRate (the admin typed the rate).
 *                      ONE rate is applied to the whole discounted bill:
 *                        taxableBase = Σ (gross − line discount)
 *                        tax         = round(taxableBase × manualTaxRate / 100, 2)
 *                        grandTotal  = taxableBase + tax
 *                      The bill tax is then apportioned onto lines in whole paise
 *                      (largest remainder) so Σ line tax == bill tax exactly. The
 *                      rate is the admin's own entry — it is NOT a verified
 *                      statutory rate — and every line keeps the catalog's own
 *                      classification in `configuredTaxRate`.
 *   line_rates       — legacy: applyTax omitted entirely. Each line is taxed at its
 *                      catalog rate (custom lines need an explicit rate). Retained
 *                      only so pre-existing API callers keep working; the billing UI
 *                      never uses it.
 *
 * Line arithmetic (all modes):
 *   gross   = unitPrice × quantity
 *   taxable = gross − line discount        (discount applied exactly once, here)
 */

const Product = require('../models/Product');
const Kit     = require('../models/Kit');
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

const MAX_LINES      = 100;
const MAX_QTY_LINE   = 10000;
const MAX_UNIT_PRICE = 10000000; // ₹1 crore per unit — sanity cap for typed prices
const LINE_TYPES     = ['product', 'kit', 'custom'];
const OBJECT_ID_RE   = /^[a-f0-9]{24}$/i;
const MONEY_RE       = /^\d{1,8}(\.\d{1,2})?$/;
const PERCENT_RE     = /^\d{1,3}(\.\d{1,2})?$/;
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

/** Catalog tax rate clamp — identical rule for products and kits. */
function catalogTaxRate(doc) {
  return Math.min(100, Math.max(0, Number(doc.taxRate) || 0));
}

/**
 * Strictly parse a typed number (JSON number or plain numeric string).
 * Rejects NaN/Infinity, exponent notation, negatives and values that carry
 * more precision than `re` allows — nothing is silently rounded.
 * @returns {number|null} null when invalid
 */
function parseStrictDecimal(value, re) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    const text = String(value);
    return re.test(text) ? value : null; // String(1e21)/String(1e-7) fail the regex
  }
  if (typeof value === 'string') {
    const text = value.trim();
    return re.test(text) ? Number(text) : null;
  }
  return null;
}

function cleanText(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Validate one raw request line into a clean descriptor, or push errors. */
function parseRawLine(raw, index, errors) {
  const item = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const label = `Line ${index + 1}`;
  const type = item.type === undefined || item.type === null || item.type === '' ? 'product' : item.type;
  if (!LINE_TYPES.includes(type)) {
    errors.push(`${label}: type must be one of ${LINE_TYPES.join(', ')}`);
    return null;
  }

  const quantity = Number(item.quantity);
  const discount = item.discount === undefined || item.discount === null || item.discount === ''
    ? 0
    : Number(item.discount);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY_LINE) {
    errors.push(`${label}: quantity must be a whole number between 1 and ${MAX_QTY_LINE}`);
    return null;
  }
  if (!Number.isFinite(discount) || discount < 0) {
    errors.push(`${label}: discount must be a non-negative number`);
    return null;
  }

  const base = { index, type, quantity, discount };

  if (type === 'product') {
    const productId = String(item.productId || '').trim();
    if (!OBJECT_ID_RE.test(productId)) {
      errors.push(`${label}: a valid productId is required`);
      return null;
    }
    const variantId = item.variantId != null && item.variantId !== '' ? String(item.variantId) : null;
    return { ...base, productId, variantId };
  }

  if (type === 'kit') {
    const kitId = String(item.kitId || '').trim();
    if (!OBJECT_ID_RE.test(kitId)) {
      errors.push(`${label}: a valid kitId is required`);
      return null;
    }
    return { ...base, kitId };
  }

  // ── custom ────────────────────────────────────────────────────────────────
  const lineErrors = [];
  if (typeof item.name !== 'string' || !cleanText(item.name, 200)) {
    lineErrors.push(`${label}: custom item name is required`);
  }
  for (const [field, max] of [['name', 200], ['description', 200], ['sku', 64], ['unit', 20]]) {
    if (item[field] !== undefined && item[field] !== null && typeof item[field] !== 'string') {
      lineErrors.push(`${label}: ${field} must be text`);
    } else if (typeof item[field] === 'string' && item[field].trim().length > max) {
      lineErrors.push(`${label}: ${field} must be at most ${max} characters`);
    }
  }

  const unitPrice = parseStrictDecimal(item.unitPrice, MONEY_RE);
  if (unitPrice === null || unitPrice > MAX_UNIT_PRICE) {
    lineErrors.push(`${label}: unit price must be a non-negative amount with at most 2 decimals`);
  }

  let configuredTaxRate = null;
  if (item.taxRate !== undefined && item.taxRate !== null && item.taxRate !== '') {
    configuredTaxRate = parseStrictDecimal(item.taxRate, PERCENT_RE);
    if (configuredTaxRate === null || configuredTaxRate > 100) {
      lineErrors.push(`${label}: tax rate must be between 0 and 100 with at most 2 decimals`);
    }
  }

  if (lineErrors.length) {
    errors.push(...lineErrors);
    return null;
  }
  return {
    ...base,
    name:        cleanText(item.name, 200),
    description: cleanText(item.description, 200),
    sku:         cleanText(item.sku, 64),
    unit:        cleanText(item.unit, 20),
    unitPrice:   roundToPaise(unitPrice),
    configuredTaxRate,
  };
}

/**
 * Validate the client's tax request into an explicit policy. Nothing is
 * defaulted or rounded: a missing/invalid rate while tax is ON is an error.
 *
 * Permitted manual rate: 0–100 inclusive, at most 2 decimal places, supplied as a
 * JSON number or plain numeric string (the Invoice schema also caps taxRate at 100).
 *
 * @returns {{mode:'none'|'manual_bill_rate'|'line_rates', applyTax:boolean, manualTaxRate:number|null}}
 */
function resolveTaxPolicy({ applyTax, manualTaxRate } = {}) {
  const hasRate = manualTaxRate !== undefined && manualTaxRate !== null && manualTaxRate !== '';

  if (applyTax === undefined || applyTax === null) {
    if (hasRate) throw new ManualBillValidationError('applyTax must be set to true when manualTaxRate is provided');
    return { mode: 'line_rates', applyTax: true, manualTaxRate: null };
  }
  if (typeof applyTax !== 'boolean') {
    throw new ManualBillValidationError('applyTax must be a boolean');
  }
  // Tax OFF: any stale percentage from the client is ignored — tax stays 0.
  if (!applyTax) return { mode: 'none', applyTax: false, manualTaxRate: null };

  if (!hasRate) {
    throw new ManualBillValidationError('A tax percentage is required when tax is applied', ['manualTaxRate is required']);
  }
  const rate = parseStrictDecimal(manualTaxRate, PERCENT_RE);
  if (rate === null || rate > 100) {
    throw new ManualBillValidationError(
      'Tax percentage must be between 0 and 100 with at most 2 decimals',
      ['manualTaxRate is invalid']
    );
  }
  return { mode: 'manual_bill_rate', applyTax: true, manualTaxRate: rate };
}

/**
 * Split `totalPaise` across `weights` (whole paise, largest remainder) so the
 * parts always add up to the total exactly.
 */
function apportionPaise(totalPaise, weights) {
  const weightSum = weights.reduce((s, w) => s + w, 0);
  if (totalPaise <= 0 || weightSum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (w * totalPaise) / weightSum);
  const parts = exact.map(Math.floor);
  let remaining = totalPaise - parts.reduce((s, p) => s + p, 0);
  exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
    .forEach(({ i }) => { if (remaining > 0) { parts[i] += 1; remaining -= 1; } });
  return parts;
}

/** Apply one bill-level percentage to already-discounted lines (mutates `lines`). */
function applyManualBillRate(lines, rate) {
  const taxablePaise = lines.map((l) => Math.round((l.unitPrice * l.quantity - l.discount) * 100));
  const baseRupees = roundToPaise(taxablePaise.reduce((s, p) => s + p, 0) / 100);
  const billTax = calculatePercentage(baseRupees, rate); // round(base × rate / 100, 2)
  const shares = apportionPaise(Math.round(billTax * 100), taxablePaise);
  lines.forEach((l, i) => {
    l.taxRate = rate;
    l.taxAmount = shares[i] / 100;
    l.lineTotal = roundToPaise((taxablePaise[i] + shares[i]) / 100);
  });
}

/** Shared money/tax arithmetic for one priced line. */
function priceLine({ unitPrice, quantity, discount, rate, applyTax }) {
  const gross   = roundToPaise(unitPrice * quantity);
  const taxable = roundToPaise(gross - discount);
  const appliedRate = applyTax ? rate : 0;
  const taxAmount = applyTax ? calculateItemTax(taxable, 1, rate) : 0; // taxable × rate / 100
  return {
    gross,
    taxRate: appliedRate,
    taxAmount,
    lineTotal: roundToPaise(taxable + taxAmount),
  };
}

/**
 * Validate + price the requested lines against the live catalog.
 *
 * @param {Array<object>} items  product | kit | custom line descriptors
 * @param {{applyTax?: boolean, manualTaxRate?: number|string}} [options]  see
 *   resolveTaxPolicy. Omitting applyTax keeps the legacy per-line-rate contract;
 *   the manual billing UI always sends an explicit applyTax.
 * @returns {Promise<{lines:Array, grossTotal:number, discountTotal:number, taxableValue:number, totalTax:number, grandTotal:number, taxApplied:boolean, taxBreakdown:Array}>}
 * @throws {ManualBillValidationError}
 */
async function calculateManualBillLines(items, taxOptions = {}) {
  const policy = resolveTaxPolicy(taxOptions);
  // Only legacy line_rates taxes per line at pricing time; manual_bill_rate taxes
  // the whole bill afterwards, and none never taxes.
  const lineTaxing = policy.mode === 'line_rates';
  const applyTax = lineTaxing;
  if (!Array.isArray(items) || items.length === 0) {
    throw new ManualBillValidationError('At least one product line is required');
  }
  if (items.length > MAX_LINES) {
    throw new ManualBillValidationError(`A manual bill supports at most ${MAX_LINES} lines`);
  }

  const errors = [];
  const clean = [];
  items.forEach((raw, index) => {
    const parsed = parseRawLine(raw, index, errors);
    if (parsed) clean.push(parsed);
  });
  if (errors.length) throw new ManualBillValidationError('Invalid bill lines', errors);

  const productIds = [...new Set(clean.filter((c) => c.type === 'product').map((c) => c.productId))];
  const kitIds     = [...new Set(clean.filter((c) => c.type === 'kit').map((c) => c.kitId))];
  const [products, kits] = await Promise.all([
    productIds.length
      ? Product.find({ _id: { $in: productIds }, isDeleted: { $ne: true }, isActive: true }).lean()
      : [],
    kitIds.length
      ? Kit.find({ _id: { $in: kitIds }, isActive: true }).lean()
      : [],
  ]);
  const productById = new Map(products.map((p) => [String(p._id), p]));
  const kitById     = new Map(kits.map((k) => [String(k._id), k]));

  const lines = [];
  for (const c of clean) {
    const label = `Line ${c.index + 1}`;
    let unitPrice; let rate; let descriptor;

    if (c.type === 'product') {
      const product = productById.get(c.productId);
      if (!product) {
        errors.push(`${label}: product not found or is not active`);
        continue;
      }
      let variant = null;
      if (c.variantId) {
        variant = (product.variants || []).find((v) => String(v.variantId) === c.variantId) || null;
        if (!variant) {
          errors.push(`${label}: variant not found for this product`);
          continue;
        }
        if (variant.isActive === false) {
          errors.push(`${label}: variant is not active`);
          continue;
        }
      } else if (Array.isArray(product.variants) && product.variants.length > 0) {
        errors.push(`${label}: a variant must be selected for this product`);
        continue;
      }
      unitPrice = resolveUnitPrice(product, variant);
      rate = catalogTaxRate(product);
      descriptor = {
        lineType:     'product',
        productId:    product._id,
        kitId:        null,
        variantId:    variant ? String(variant.variantId) : null,
        name:         product.name,
        variantLabel: variant ? String(variant.quantity || '') : '',
        sku:          variant ? String(variant.sku || '') : String(product.sku || ''),
        unit:         '',
        configuredTaxRate: rate,
      };
    } else if (c.type === 'kit') {
      const kit = kitById.get(c.kitId);
      if (!kit) {
        errors.push(`${label}: kit not found or is not active`);
        continue;
      }
      const kitPrice = Number(kit.discountPrice);
      if (!Number.isFinite(kitPrice) || kitPrice < 0) {
        errors.push(`${label}: kit has no valid selling price`);
        continue;
      }
      unitPrice = roundToPaise(kitPrice); // the stored kit selling price — same field bookings charge
      rate = catalogTaxRate(kit);
      const count = Array.isArray(kit.items) ? kit.items.length : 0;
      descriptor = {
        lineType:     'kit',
        productId:    null, // kits never touch product stock (see inventory policy in the controller)
        kitId:        kit._id,
        variantId:    null,
        name:         kit.name,
        variantLabel: `Kit${count ? ` (${count} item${count === 1 ? '' : 's'})` : ''}`,
        sku:          '',
        unit:         '',
        configuredTaxRate: rate,
      };
    } else {
      // custom — tax must be explicit whenever it is applied; no silent default.
      if (applyTax && c.configuredTaxRate === null) {
        errors.push(`${label}: "${c.name}" needs an explicit tax rate (0 for exempt) when tax is applied`);
        continue;
      }
      unitPrice = c.unitPrice;
      rate = c.configuredTaxRate === null ? 0 : c.configuredTaxRate;
      descriptor = {
        lineType:     'custom',
        productId:    null,
        kitId:        null,
        variantId:    null,
        name:         c.name,
        variantLabel: c.description,
        sku:          c.sku,
        unit:         c.unit,
        configuredTaxRate: c.configuredTaxRate,
      };
    }

    const gross = roundToPaise(unitPrice * c.quantity);
    if (c.discount > gross) {
      errors.push(`${label}: discount cannot exceed the line gross amount`);
      continue;
    }
    const discount = roundToPaise(c.discount);
    const priced = priceLine({ unitPrice, quantity: c.quantity, discount, rate, applyTax });

    lines.push({
      ...descriptor,
      hsn:       '', // no HSN/SAC field on Product yet — never invented
      quantity:  c.quantity,
      unitPrice,
      discount,
      taxRate:   priced.taxRate,
      taxAmount: priced.taxAmount,
      lineTotal: priced.lineTotal,
    });
  }

  if (errors.length) throw new ManualBillValidationError('Invalid bill lines', errors);
  if (lines.length === 0) throw new ManualBillValidationError('At least one valid product line is required');

  if (policy.mode === 'manual_bill_rate') applyManualBillRate(lines, policy.manualTaxRate);

  return {
    ...finalizeTotals(lines),
    taxApplied: policy.applyTax,
    taxMode: policy.mode,
    manualTaxRate: policy.manualTaxRate,
  };
}

/** Deterministic totals from already-priced lines. */
function finalizeTotals(lines) {
  const grossTotal    = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const discountTotal = lines.reduce((s, l) => s + l.discount, 0);
  const taxableValue  = lines.reduce((s, l) => s + (l.unitPrice * l.quantity - l.discount), 0);
  const totalTax      = lines.reduce((s, l) => s + l.taxAmount, 0);
  const grandTotal    = lines.reduce((s, l) => s + l.lineTotal, 0);

  // Aggregate tax per applied rate (for the summary / invoice) — display only,
  // never an input to the totals above.
  const byRate = new Map();
  for (const l of lines) {
    if (!(l.taxRate > 0)) continue;
    const row = byRate.get(l.taxRate) || { rate: l.taxRate, taxableValue: 0, taxAmount: 0 };
    row.taxableValue += l.unitPrice * l.quantity - l.discount;
    row.taxAmount    += l.taxAmount;
    byRate.set(l.taxRate, row);
  }
  const taxBreakdown = [...byRate.values()]
    .sort((a, b) => a.rate - b.rate)
    .map((r) => ({ rate: r.rate, taxableValue: roundToPaise(r.taxableValue), taxAmount: roundToPaise(r.taxAmount) }));

  return {
    lines,
    grossTotal:    roundToPaise(grossTotal),
    discountTotal: roundToPaise(discountTotal),
    taxableValue:  roundToPaise(taxableValue),
    totalTax:      roundToPaise(totalTax),
    grandTotal:    roundToPaise(grandTotal),
    taxBreakdown,
  };
}

/** Full result used by preview + finalize: lines, totals and GST split. */
function buildManualBill({
  computedLines, customerState, sellerState,
  taxApplied = true, taxMode = 'line_rates', manualTaxRate = null,
}) {
  const totals = finalizeTotals(computedLines);
  const gstBreakdown = buildBillGstBreakdown(totals.totalTax, customerState, sellerState);
  return { ...totals, gstBreakdown, taxApplied, taxMode, manualTaxRate };
}

module.exports = {
  ManualBillValidationError,
  calculateManualBillLines,
  finalizeTotals,
  buildBillGstBreakdown,
  buildManualBill,
  resolveTaxPolicy,
  apportionPaise,
  normalizeState,
  parseStrictDecimal,
  MAX_LINES,
  MAX_QTY_LINE,
  MAX_UNIT_PRICE,
};
