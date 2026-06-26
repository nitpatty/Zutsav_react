const mongoose = require('mongoose');

const inventoryLogSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  variantId: { type: String, default: null },
  change:    { type: Number, required: true },    // negative = deducted, positive = restored
  prevStock: { type: Number, required: true },
  newStock:  { type: Number, required: true },
  reason:    { type: String, required: true },    // 'order_paid' | 'order_cancelled' | 'order_refunded' | 'admin_edit'
  orderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  updatedBy: { type: String, default: 'system' },
}, { timestamps: true });

module.exports = mongoose.model('InventoryLog', inventoryLogSchema);
