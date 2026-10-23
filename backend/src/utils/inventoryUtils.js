const Product      = require('../models/Product');
const InventoryLog = require('../models/InventoryLog');

/**
 * Deduct stock after a successful payment.
 * Variant products: updates variants.$.stock atomically.
 * Flat products:    updates product.stock atomically.
 * Writes an InventoryLog entry for every item.
 */
async function deductStock(orderItems, orderId = null, updatedBy = 'system') {
  for (const item of orderItems) {
    if (item.variantId) {
      const before = await Product.findOneAndUpdate(
        { _id: item.productId, 'variants.variantId': item.variantId },
        { $inc: { 'variants.$.stock': -item.quantity } }
        // default: returns document BEFORE the update (new: false)
      );
      if (before) {
        const v    = (before.variants || []).find((v) => v.variantId === item.variantId);
        const prev = v?.stock ?? 0;
        InventoryLog.create({
          productId: item.productId,
          variantId: item.variantId,
          change:    -item.quantity,
          prevStock: prev,
          newStock:  Math.max(0, prev - item.quantity),
          reason:    'order_paid',
          orderId,
          updatedBy,
        }).catch(() => {});
      }
    } else {
      const before = await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { stock: -item.quantity } }
        // default: returns document BEFORE the update
      );
      if (before) {
        InventoryLog.create({
          productId: item.productId,
          variantId: null,
          change:    -item.quantity,
          prevStock: before.stock,
          newStock:  Math.max(0, before.stock - item.quantity),
          reason:    'order_paid',
          orderId,
          updatedBy,
        }).catch(() => {});
      }
    }
  }
}

/**
 * Restore stock on cancellation or refund.
 * Mirror of deductStock — same variant-aware atomic logic.
 */
async function restoreStock(orderItems, reason, orderId = null, updatedBy = 'system') {
  for (const item of orderItems) {
    if (item.variantId) {
      const before = await Product.findOneAndUpdate(
        { _id: item.productId, 'variants.variantId': item.variantId },
        { $inc: { 'variants.$.stock': item.quantity } }
      );
      if (before) {
        const v    = (before.variants || []).find((v) => v.variantId === item.variantId);
        const prev = v?.stock ?? 0;
        InventoryLog.create({
          productId: item.productId,
          variantId: item.variantId,
          change:    item.quantity,
          prevStock: prev,
          newStock:  prev + item.quantity,
          reason,
          orderId,
          updatedBy,
        }).catch(() => {});
      }
    } else {
      const before = await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { stock: item.quantity } }
      );
      if (before) {
        InventoryLog.create({
          productId: item.productId,
          variantId: null,
          change:    item.quantity,
          prevStock: before.stock,
          newStock:  before.stock + item.quantity,
          reason,
          orderId,
          updatedBy,
        }).catch(() => {});
      }
    }
  }
}

/**
 * ── Manual-billing stock movements ─────────────────────────────────────────
 * Same variant-aware atomic $inc pattern as deductStock/restoreStock, with two
 * deliberate differences:
 *   1. A `stock >= quantity` guard — a competing sale can never drive stock
 *      negative; the caller receives a per-line failure instead.
 *   2. The movement is linked to an Invoice (`invoiceId`), never an Order.
 * The caller is responsible for the once-only guarantee (Invoice.stockDeducted
 * / stockRestored atomic flags); these helpers perform exactly one movement.
 */

/** @returns {Promise<{ok:boolean, failures:Array}>} */
async function deductManualSaleStock(items, invoiceId, updatedBy = 'system') {
  const failures = [];
  for (const item of items) {
    if (!item.productId || !item.quantity) continue;

    if (item.variantId) {
      const before = await Product.findOneAndUpdate(
        {
          _id: item.productId,
          variants: { $elemMatch: { variantId: item.variantId, stock: { $gte: item.quantity } } },
        },
        { $inc: { 'variants.$.stock': -item.quantity } }
      );
      if (!before) {
        failures.push({ productId: item.productId, variantId: item.variantId, reason: 'insufficient_stock' });
        continue;
      }
      const v    = (before.variants || []).find((x) => x.variantId === item.variantId);
      const prev = v?.stock ?? 0;
      await InventoryLog.create({
        productId: item.productId,
        variantId: item.variantId,
        change:    -item.quantity,
        prevStock: prev,
        newStock:  prev - item.quantity,
        reason:    'manual_sale',
        invoiceId,
        updatedBy,
      }).catch(() => {});
    } else {
      const before = await Product.findOneAndUpdate(
        { _id: item.productId, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } }
      );
      if (!before) {
        failures.push({ productId: item.productId, variantId: null, reason: 'insufficient_stock' });
        continue;
      }
      await InventoryLog.create({
        productId: item.productId,
        variantId: null,
        change:    -item.quantity,
        prevStock: before.stock,
        newStock:  before.stock - item.quantity,
        reason:    'manual_sale',
        invoiceId,
        updatedBy,
      }).catch(() => {});
    }
  }
  return { ok: failures.length === 0, failures };
}

/** Restore stock for a cancelled manual sale (exactly once, by caller's guard). */
async function restoreManualSaleStock(items, invoiceId, updatedBy = 'system') {
  const failures = [];
  for (const item of items) {
    if (!item.productId || !item.quantity) continue;

    if (item.variantId) {
      const before = await Product.findOneAndUpdate(
        { _id: item.productId, 'variants.variantId': item.variantId },
        { $inc: { 'variants.$.stock': item.quantity } }
      );
      if (!before) {
        failures.push({ productId: item.productId, variantId: item.variantId, reason: 'not_found' });
        continue;
      }
      const v    = (before.variants || []).find((x) => x.variantId === item.variantId);
      const prev = v?.stock ?? 0;
      await InventoryLog.create({
        productId: item.productId,
        variantId: item.variantId,
        change:    item.quantity,
        prevStock: prev,
        newStock:  prev + item.quantity,
        reason:    'manual_sale_cancelled',
        invoiceId,
        updatedBy,
      }).catch(() => {});
    } else {
      const before = await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { stock: item.quantity } }
      );
      if (!before) {
        failures.push({ productId: item.productId, variantId: null, reason: 'not_found' });
        continue;
      }
      await InventoryLog.create({
        productId: item.productId,
        variantId: null,
        change:    item.quantity,
        prevStock: before.stock,
        newStock:  before.stock + item.quantity,
        reason:    'manual_sale_cancelled',
        invoiceId,
        updatedBy,
      }).catch(() => {});
    }
  }
  return { ok: failures.length === 0, failures };
}

module.exports = { deductStock, restoreStock, deductManualSaleStock, restoreManualSaleStock };
