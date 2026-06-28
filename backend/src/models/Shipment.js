const mongoose = require('mongoose');

const historyEntrySchema = new mongoose.Schema({
  status:    { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  note:      { type: String, default: '' },
  updatedBy: { type: String, default: 'system' },
}, { _id: false });

const shipmentSchema = new mongoose.Schema({
  orderId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Order',
    required: true,
    unique:   true,
  },

  shippingMethod: {
    type:     String,
    enum:     ['tekipost', 'manual'],
    required: true,
  },

  // Only set for manual shipments
  manualType: {
    type:    String,
    enum:    ['courier', 'local_delivery', null],
    default: null,
  },

  // ── TekiPost Single Order fields ─────────────────────────────────────────
  tekipostOrderId:     { type: String, default: '' },   // from Step 1; persisted so courier selection can resume on page refresh
  availableCouriers:   { type: mongoose.Schema.Types.Mixed, default: null },
  selectedCourierCode: { type: String, default: '' },
  freightCharges:      { type: Number, default: 0 },
  pickupDate:          { type: Date,   default: null },

  // ── AWB Cancellation ─────────────────────────────────────────────────────
  isCancelled:        { type: Boolean, default: false },
  cancelledAt:        { type: Date,    default: null },
  cancellationReason: { type: String,  default: '' },
  walletRefundStatus: {
    type:    String,
    enum:    ['not_applicable', 'pending', 'refunded'],
    default: 'not_applicable',
  },
  walletRefundAmount: { type: Number, default: 0 },

  // ── Courier / TekiPost fields ─────────────────────────────────────────────
  courierName:    { type: String, default: '' },
  trackingNumber: { type: String, default: '' },
  awbNumber:      { type: String, default: '' },
  labelUrl:       { type: String, default: '' },
  trackingUrl:    { type: String, default: '' },

  // ── Local delivery fields ─────────────────────────────────────────────────
  deliveryPartner: { type: String, default: '' },
  driverName:      { type: String, default: '' },
  driverPhone:     { type: String, default: '' },
  vehicleNumber:   { type: String, default: '' },
  expectedTime:    { type: String, default: '' },

  estimatedDelivery: { type: Date, default: null },
  remarks:           { type: String, default: '' },

  shipmentStatus: {
    type:    String,
    enum:    [
      'pending_courier_selection',  // TekiPost order created; awaiting admin courier selection
      'created',                    // AWB generated — shipment confirmed
      'picked_up',
      'in_transit',
      'out_for_delivery',
      'delivered',
      'failed_delivery',
      'cancelled',
      'returned',
    ],
    default: 'created',
  },

  shipmentHistory: [historyEntrySchema],

  // Raw TekiPost response for audit / re-fetch
  tekipostData:  { type: mongoose.Schema.Types.Mixed, default: null },
  lastSyncedAt:  { type: Date, default: null },

  createdBy: { type: String, default: 'admin' },
}, { timestamps: true });

module.exports = mongoose.model('Shipment', shipmentSchema);
