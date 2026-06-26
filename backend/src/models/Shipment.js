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

  // Courier / TekiPost fields
  courierName:    { type: String, default: '' },
  trackingNumber: { type: String, default: '' },
  awbNumber:      { type: String, default: '' },
  labelUrl:       { type: String, default: '' },
  trackingUrl:    { type: String, default: '' },

  // Local delivery fields
  deliveryPartner: { type: String, default: '' },
  driverName:      { type: String, default: '' },
  driverPhone:     { type: String, default: '' },
  vehicleNumber:   { type: String, default: '' },
  expectedTime:    { type: String, default: '' }, // e.g. "3:00 PM"

  estimatedDelivery: { type: Date, default: null },
  remarks:           { type: String, default: '' },

  shipmentStatus: {
    type:    String,
    enum:    ['created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed_delivery', 'cancelled', 'returned'],
    default: 'created',
  },

  shipmentHistory: [historyEntrySchema],

  // Raw TekiPost response for audit / re-fetch
  tekipostData:  { type: mongoose.Schema.Types.Mixed, default: null },
  lastSyncedAt:  { type: Date, default: null },

  createdBy: { type: String, default: 'admin' },
}, { timestamps: true });

module.exports = mongoose.model('Shipment', shipmentSchema);
