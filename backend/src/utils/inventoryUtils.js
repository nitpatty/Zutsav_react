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

module.exports = { deductStock, restoreStock };
