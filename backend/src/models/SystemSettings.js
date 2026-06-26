const mongoose = require('mongoose');

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
}, { timestamps: true });

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
