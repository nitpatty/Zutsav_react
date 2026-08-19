const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, lowercase: true, trim: true },
  phone: {
    type: String,
    required: true,
    validate: {
      validator: (v) => /^[6-9]\d{9}$/.test(v),
      message: 'Enter a valid 10-digit Indian mobile number',
    },
  },
  password: { type: String, required: true, minlength: 6, select: false },
  role: { type: String, enum: ['user', 'pandit', 'admin', 'system_admin'], default: 'user' },
  profilePhoto: { type: String, default: null },

  // ── Admin-tier profile fields ─────────────────────────────────────────
  employeeId:   { type: String }, // no default: must stay truly absent (not null) for new admins, or the sparse unique index treats every null as a collision
  department:   { type: String, default: null },
  designation:  { type: String, default: null },
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // ── Soft-delete (admin-tier only — distinct from accountStatus below) ──
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // ── Login tracking (denormalized latest values; full history in LoginHistory) ──
  lastLoginAt:      { type: Date, default: null },
  lastLoginIP:      { type: String, default: null },
  failedLoginCount: { type: Number, default: 0 },
  pincode: { type: String },
  state:   { type: String },
  city:    { type: String },
  district:{ type: String },
  address: { type: String },
  isActive:      { type: Boolean, default: true },
  referralCode:  { type: String, unique: true, sparse: true },
  referredBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  referralCount: { type: Number, default: 0 },

  // Global app language preference — applies across every page/module/role
  // (see frontend/src/context/LanguageContext.js). Not role-specific; every
  // user regardless of role shares this same field and Settings UI.
  preferredLanguage: { type: String, default: 'en' },

  savedAddresses: [{
    label:    { type: String, default: 'Home' },
    address:  { type: String, required: true },
    pincode:  { type: String },
    state:    { type: String },
    city:     { type: String },
    district: { type: String },
    isDefault:{ type: Boolean, default: false },
  }],

  // Family members — embedded array owned by the authenticated user.
  // No separate userId per member; ownership is the parent User document.
  familyMembers: [{
    name:        { type: String, required: true, trim: true },
    relationship:{ type: String, required: true, trim: true },
    dateOfBirth: { type: Date, default: null },
  }],

  // 30-day safe deletion
  accountStatus:         { type: String, enum: ['active', 'deletion_pending'], default: 'active' },
  deletionRequestedAt:   { type: Date, default: null },
  scheduledDeletionDate: { type: Date, default: null },

  // Embedded in every issued JWT as `v`; protect()/optionalAuth() reject a
  // token whose `v` doesn't match this value. Incrementing it instantly
  // invalidates every previously-issued token for this user on every
  // device — used by password reset to force a fresh login everywhere.
  tokenVersion: { type: Number, default: 0 },

  // ── WhatsApp number verification ──────────────────────────────────────
  // Set only when the user's phone was verified via a WhatsApp OTP (see
  // auth.controller.js completeRegistration — the verified OTP record's
  // channel is the source of truth). Proof of control over the number only:
  // it is NOT consent and never implies service or marketing communication
  // consent (see services/consentService.js + models/WhatsAppPreference.js).
  whatsappVerified:   { type: Boolean, default: false },
  whatsappVerifiedAt: { type: Date,    default: null },
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 12);
  }
  if (!this.referralCode) {
    const namePart = this.name.replace(/\s+/g, '').substring(0, 4).toUpperCase();
    const idPart   = this._id.toString().slice(-4).toUpperCase();
    this.referralCode = `${namePart}${idPart}`;
  }
  next();
});

userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Never send password
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

// Unique among non-deleted accounts only — lets a soft-deleted admin's
// email/phone be reused by a newly-created account. email must also require
// $exists: true — a partialFilterExpression only filters by isDeleted, it
// does NOT exclude documents where email is missing (unlike a sparse index),
// so without $exists every admin with no email would collide on email:null.
userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { isDeleted: false, email: { $exists: true } } });
userSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
userSchema.index({ role: 1, isDeleted: 1, isActive: 1 });
userSchema.index({ employeeId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('User', userSchema);
