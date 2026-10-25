const mongoose = require('mongoose');

// ── Company billing registrations (Manual Billing "Bill From") ───────────────
// One or more GST registrations the business can invoice under. Stored in the
// existing System Settings document (single source of truth) and snapshotted
// onto each manual invoice at finalization.
const billingRegistrationSchema = new mongoose.Schema({
  id:        { type: String, required: true },
  legalName: { type: String, required: true, trim: true },
  gstin:     { type: String, required: true, trim: true, uppercase: true },
  pan:       { type: String, default: '', trim: true, uppercase: true },
  address:   { type: String, default: '', trim: true },
  state:     { type: String, required: true, trim: true },
  stateCode: { type: String, default: '', trim: true }, // must match GSTIN prefix
  isActive:  { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false },
}, { _id: false });

// ── Custom footer links (System Configuration → Frontend) ────────────────────
// Admin-managed links shown in the public footer, in addition to the fixed legal
// documents (LegalDocument). Each link has EXACTLY ONE destination:
//   linkType 'url'      → `url` (validated http/https)
//   linkType 'document' → `document` (an uploaded PDF/DOC/DOCX kept under
//                          uploads/legaldocs, served only via the public view API)
// `labelKey` is the normalized (lower-cased) label, used to enforce unique names
// atomically. `storagePath` never leaves the server.
const footerLinkDocumentSchema = new mongoose.Schema({
  originalName:   { type: String, required: true },
  storedFileName: { type: String, required: true },
  mimeType:       { type: String, required: true },
  size:           { type: Number, required: true },
  storagePath:    { type: String, required: true },
  uploadedByName: { type: String, default: '' },
  uploadedAt:     { type: Date, default: Date.now },
}, { _id: false });

const footerLinkSchema = new mongoose.Schema({
  id:        { type: String, required: true },
  label:     { type: String, required: true, trim: true, maxlength: 60 },
  labelKey:  { type: String, required: true },
  linkType:  { type: String, enum: ['url', 'document'], required: true },
  url:       { type: String, default: '' },
  document:  { type: footerLinkDocumentSchema, default: null },
  enabled:   { type: Boolean, default: true },
  order:     { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
}, { _id: false });

const systemSettingsSchema = new mongoose.Schema({
  // General
  platformName:    { type: String, default: 'Zutsav' },
  logo:            { type: String, default: '' },
  contactEmail:    { type: String, default: '' },
  supportPhone:    { type: String, default: '' },
  supportAddress:  { type: String, default: '' },

  // Payment - PhonePe
  phonepeEnv:        { type: String, enum: ['sandbox', 'prod'], default: 'sandbox' },
  phonepeMerchantId: { type: String, default: '' },
  phonepeSaltKey:    { type: String, default: '' },
  phonepeSaltIndex:  { type: String, default: '1' },
  phonepeWebhookUrl: { type: String, default: '' },
  phonepeRedirectUrl:{ type: String, default: '' },

  // WhatsApp (Meta Cloud API)
  whatsappAppId:              { type: String, default: '' },
  whatsappPhoneNumberId:      { type: String, default: '' },
  whatsappBusinessAccountId:  { type: String, default: '' },
  whatsappAccessToken:        { type: String, default: '' },
  whatsappApiVersion:         { type: String, default: 'v18.0' },

  // Email / SMTP
  emailSmtpHost:     { type: String, default: '' },
  emailSmtpPort:     { type: Number, default: 587 },
  emailSmtpUser:     { type: String, default: '' },
  emailSmtpPassword: { type: String, default: '' },
  emailService:      { type: String, default: 'smtp' },
  emailSenderName:   { type: String, default: 'Zutsav' },

  // Platform Commission & Tax
  platformCommissionType:    { type: String, enum: ['percent', 'fixed'], default: 'percent' },
  platformCommissionPercent: { type: Number, default: 0, min: 0, max: 100 },
  platformCommissionFixed:   { type: Number, default: 0, min: 0 },
  platformGstPercent:        { type: Number, default: 0, min: 0, max: 100 },

  // Partial Payment Rules
  partialPaymentEnabled:   { type: Boolean, default: false },
  partialPaymentMinAmount: { type: Number,  default: 500, min: 0 },
  partialPaymentMode:      { type: String,  enum: ['percentage', 'fixed'], default: 'fixed' },
  partialPaymentOptions:   { type: [Number], default: [500, 1000, 1500] },

  // Delivery Provider
  defaultDeliveryProvider: { type: String, enum: ['manual', 'tekipost'], default: 'manual' },
  tekipostApiKey:          { type: String, default: '' },
  tekipostBaseUrl:         { type: String, default: 'https://api.tekipost.com' },

  // AI - Groq
  groqApiKey: { type: String, default: '' },
  groqModel:  { type: String, default: 'llama-3.3-70b-versatile' },

  // AI - Sarvam (content translation; primary provider, Groq is fallback)
  sarvamApiKey: { type: String, default: '' },
  sarvamModel:  { type: String, default: 'sarvam-translate:v1' },

  // Panchang - FreeAstroAPI
  freeAstroApiKey: { type: String, default: '' },

  // Media - Cloudinary
  cloudinaryCloudName: { type: String, default: '' },
  cloudinaryApiKey:    { type: String, default: '' },
  cloudinaryApiSecret: { type: String, default: '' },

  // Security
  sessionTimeoutMinutes: { type: Number, default: 60 },
  otpExpiryMinutes:      { type: Number, default: 10 },
  passwordMinLength:     { type: Number, default: 6 },
  passwordRequireUpper:  { type: Boolean, default: false },
  passwordRequireSymbol: { type: Boolean, default: false },

  // Blog Permissions
  blogAdminPublish:          { type: Boolean, default: true  },
  blogPanditPublish:         { type: Boolean, default: true  },
  blogUserPublish:           { type: Boolean, default: false },
  blogPanditRequireApproval: { type: Boolean, default: true  },
  blogUserRequireApproval:   { type: Boolean, default: true  },

  // Log Retention (days; 0 = keep forever)
  logRetentionNotificationLog: { type: Number, default: 90  },
  logRetentionNotification:    { type: Number, default: 180 },
  logRetentionInventory:       { type: Number, default: 365 },
  logRetentionSync:            { type: Number, default: 180 },
  logRetentionAudit:           { type: Number, default: 730 },
  logAutoCleanupEnabled:       { type: Boolean, default: false },

  // Deployment (System Configuration Center — admin-editable runtime URLs)
  deployWebsiteUrl:   { type: String, default: '' },
  deployApiUrl:       { type: String, default: '' },
  deployAdminUrl:     { type: String, default: '' },
  deployMobileApiUrl: { type: String, default: '' },
  deploySocketUrl:    { type: String, default: '' }, // future use
  deployCdnUrl:       { type: String, default: '' }, // future use

  // Company legal info (System Configuration Center)
  companyGstin: { type: String, default: '' },
  companyPan:   { type: String, default: '' },
  companyState: { type: String, default: '' },

  // Company billing registrations (Manual Billing "Bill From")
  // Empty array = nothing configured → the backend-controlled recommended
  // fallback is offered (clearly marked unverified) until an Admin configures
  // a registration.
  companyBillingRegistrations: { type: [billingRegistrationSchema], default: [] },

  // Communication (System Configuration Center)
  whatsappNumber:     { type: String, default: '' },
  customerCareNumber: { type: String, default: '' },

  // Mobile (System Configuration Center)
  mobileSupportUrl: { type: String, default: '' },

  // ── User Referral Program ─────────────────────────────────────────────────
  userReferralEnabled:                { type: Boolean, default: false },
  userReferralDefaultValidityDays:    { type: Number,  default: 30, min: 1 },
  userReferralDailyLimit:             { type: Number,  default: 5,  min: 1 },
  userReferralRegistrationRewardCoins:{ type: Number,  default: 10, min: 0 },
  userReferralBookingRewardCoins:     { type: Number,  default: 50, min: 0 },
  // Max qualifying completed bookings per referred user that can generate a
  // booking reward for the referrer. 0 disables booking rewards entirely.
  maxRewardedBookingsPerReferredUser:{ type: Number,  default: 5,  min: 0 },

  // ── Wallet / Coins ────────────────────────────────────────────────────────
  // coinMonetaryValue: null means 'not yet configured' — Admin must set it
  // before coin redemption can be used in checkout. Do NOT default to 1.
  coinMonetaryValue: { type: Number, default: null },

  // Minimum coins a user must hold in their wallet before coin redemption
  // becomes available at checkout. This is an ELIGIBILITY threshold (balance
  // gate), not a minimum per-transaction redemption amount.
  coinRedemptionMinCoins: { type: Number, default: 0, min: 0 },

  // ── Pooja Booking Loyalty Reward (global, applies to all eligible Pooja
  //    bookings; percentage of the PRE-TAX pooja service amount credited to
  //    the user's wallet when the booking reaches COMPLETED) ──────────────
  poojaBookingCoinRewardPercent: { type: Number, default: 5, min: 0, max: 100 },

  // ── Urgent Booking Price Hike (global) ───────────────────────────────────
  // Applied ONLY to urgent bookings (bookingType === 'urgent'). The surcharge
  // is added to the EXISTING gross booking total AFTER tax/fee calculations
  // and BEFORE coupon / coin deductions. Normal bookings are never affected.
  //   percent mode → surcharge = calculatePercentage(grandTotal, hikePercent)
  //   fixed mode   → surcharge = roundToPaise(hikeFixed)
  urgentBookingHikeType:    { type: String, enum: ['percent', 'fixed'], default: 'percent' },
  urgentBookingHikePercent: { type: Number, default: 0, min: 0, max: 100 },
  urgentBookingHikeFixed:   { type: Number, default: 0, min: 0 },

  // ── Urgent Booking Cutoff Time (global) ───────────────────────────────────
  // Daily business-time (Asia/Kolkata) cutoff for URGENT bookings only. Before
  // this time tomorrow is eligible; at/after this time the earliest eligible
  // date moves to the day after tomorrow. One single global value drives the
  // backend rule, the web date picker and the mobile date picker. Normal
  // bookings are never affected.
  //   format: 'HH:mm' (00:00–23:59), default '18:30' preserves legacy behavior.
  urgentBookingCutoffTime: {
    type: String,
    default: '18:30',
    validate: {
      validator: (v) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(v),
      message:   'Invalid cutoff time format',
    },
  },

  // Custom public footer links (see footerLinkSchema above). Max 20 — enforced in the controller.
  footerLinks: { type: [footerLinkSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
