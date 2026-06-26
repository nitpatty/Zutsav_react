const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  bookingNumber: { type: String, unique: true },

  // Relations
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
  poojaId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Pooja',  required: true },
  panditId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pandit', default: null },

  // User details at time of booking
  userDetails: {
    name:      { type: String, required: true },
    phone:     { type: String, required: true },
    email:     { type: String },
    address:   { type: String, required: true },
    pincode:   { type: String, required: true },
    state:     { type: String },
    city:      { type: String },
    district:  { type: String },
  },

  // Schedule
  scheduledDate: { type: Date, required: true },
  scheduledTime: { type: String, required: true },
  language:      { type: String, default: 'Hindi' },
  specialNote:   { type: String },

  // Booking type
  bookingType: { type: String, enum: ['normal', 'urgent'], default: 'normal' },

  // Accounting fields (required for GST reporting)
  poojaAmount:  { type: Number, default: 0 },  // pooja service price (always GST-exempt)
  kitAmount:    { type: Number, default: 0 },  // samagri kit price
  kitGST:       { type: Number, default: 0 },  // GST on kit (platformGstPercent%)
  platformFee:  { type: Number, default: 0 },  // platform commission
  platformGST:  { type: Number, default: 0 },  // GST on platform fee (platformGstPercent%)
  taxAmount:    { type: Number, default: 0 },  // alias for kitGST (backward compat)
  grandTotal:   { type: Number, default: 0 },  // total charged to user

  // Legacy pricing fields (kept for backward compatibility)
  baseAmount:        { type: Number, default: 0 },
  commissionPercent: { type: Number, default: 0 },
  commissionAmount:  { type: Number, default: 0 },
  gstPercent:        { type: Number, default: 0 },
  gstAmount:         { type: Number, default: 0 },

  // Partial payment tracking
  paymentMode:      { type: String, enum: ['FULL', 'PARTIAL'], default: 'FULL' },
  paymentStatus:    { type: String, enum: ['PENDING', 'PARTIALLY_PAID', 'FULLY_PAID', 'REFUNDED', 'FAILED'], default: 'PENDING' },
  amountPaid:       { type: Number, default: 0 },
  remainingAmount:  { type: Number, default: 0 },

  // Payment (final amount charged to user)
  amount:              { type: Number, required: true },
  paymentProvider:     { type: String, enum: ['razorpay', 'phonepe'], default: 'phonepe' },
  // Razorpay (legacy)
  razorpayOrderId:     { type: String },
  razorpayPaymentId:   { type: String },
  razorpaySignature:   { type: String },
  // PhonePe
  phonePeMerchantTransactionId: { type: String },
  phonePeTransactionId:         { type: String },

  // Status flow: pending_payment → paid → pandit_assigned → pandit_accepted → completion_requested → completed / cancelled
  //              pandit_assigned → pandit_rejected → pending_reassignment → pandit_assigned (reassigned)
  //              completed / cancelled → refunded → closed
  status: {
    type: String,
    enum: [
      'pending_payment', 'paid',
      'pandit_assigned', 'pandit_accepted',
      'pending_reassignment',
      'completion_requested', 'completed',
      'cancelled', 'refunded', 'closed',
    ],
    default: 'pending_payment',
  },

  // OTP-based completion (pandit requests, OTP sent to user)
  completionOtp:              { type: String, default: null },   // bcrypt hash
  completionOtpExpiry:        { type: Date,   default: null },
  completionOtpRequestedAt:   { type: Date,   default: null },

  // Urgent booking + kit selection
  isUrgent:   { type: Boolean, default: false },
  withKit:    { type: Boolean, default: false },
  kitId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Kit', default: null },

  // Kit delivery (created by admin after booking)
  kitDelivery: {
    type:           { type: String, enum: ['courier', 'manual', 'none'], default: 'none' },
    status:         { type: String, enum: ['pending', 'packed', 'shipped', 'out_for_delivery', 'delivered'], default: 'pending' },
    // Courier fields
    trackingId:     { type: String },
    courier:        { type: String },
    labelUrl:       { type: String },
    // Manual fields
    assignedPerson: { type: String },
    assignedPhone:  { type: String },
    remarks:        { type: String },
    updatedAt:      { type: Date },
  },

  // Pandits who rejected this booking (excluded from reassignment list)
  panditRejections: [{
    panditId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Pandit' },
    panditName: { type: String },
    reason:     { type: String },
    rejectedAt: { type: Date, default: Date.now },
  }],

  // Admin-negotiated fare (stored before assignment; never shown to user or pandit)
  panditFareAmount: { type: Number, default: null },

  // Completion timestamps
  completedAt:    { type: Date },
  verifiedAt:     { type: Date },
  verifiedByName: { type: String },

  // User rating after completion
  rating:     { type: Number, min: 1, max: 5, default: null },
  review:     { type: String, default: '' },
  ratingDate: { type: Date },

  // WhatsApp notification sent flag
  whatsappNotified: { type: Boolean, default: false },
  panditAssignedAt: { type: Date },
  cancelReason:     { type: String },

  // Reminder tracking — set true by cron jobs to prevent duplicate sends
  reminder24hSent:      { type: Boolean, default: false },
  reminder1hSent:       { type: Boolean, default: false },
  feedbackReminderSent: { type: Boolean, default: false },
  invoiceSent:          { type: Boolean, default: false },

  // Audit trail for all status transitions and admin actions
  auditLog: [{
    action:          { type: String },
    performedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    performedByName: { type: String },
    note:            { type: String },
    at:              { type: Date, default: Date.now },
  }],

  // Pandit payout (auto-populated when admin verifies completion)
  payout: {
    amount:         { type: Number, default: 0 },
    status:         { type: String, enum: ['none', 'pending', 'completed'], default: 'none' },
    paidAt:         { type: Date },
    transactionRef: { type: String },
    assignedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedByName: { type: String },
  },
  // Reference to the PayoutBatch this booking was settled in (null = unpaid / individual)
  payoutBatchId: { type: mongoose.Schema.Types.ObjectId, ref: 'PayoutBatch', default: null },
}, { timestamps: true });

// Auto-generate booking number
bookingSchema.pre('save', async function (next) {
  if (!this.bookingNumber) {
    const count = await this.constructor.countDocuments();
    this.bookingNumber = `ZUT${Date.now().toString().slice(-6)}${String(count + 1).padStart(3, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Booking', bookingSchema);
