const Pandit      = require('../models/Pandit');
const Pooja       = require('../models/Pooja');
const User        = require('../models/User');
const Booking     = require('../models/Booking');
const Referral    = require('../models/Referral');
const PayoutBatch = require('../models/PayoutBatch');
const OTP         = require('../models/OTP');
const path    = require('path');
const fs      = require('fs');
const { NotificationEngine } = require('../../notification-engine');
const { normalizePanditPayload, normalizeBookingPayload, normalizeUserPayload } = require('../../notification-engine/variables/PayloadNormalizer');
const OtpService = require('../../notification-engine/otp/OtpService');
const { getPanditPayoutStatusLabel, healPanditPendingPayouts, resolveApprovedPayoutAmount } = require('../utils/payoutUtils');
const { KYC_FIELD_MAP, resolveStoredFile, deleteStoredFile } = require('../utils/kycFileStorage');

const KYC_VIEW_SESSION_MS = 5 * 60 * 1000; // 5 minutes, per the retained-document viewing flow
const KYC_OTP_PURPOSE     = 'kyc_document_view';

// Fields a pandit must never see (financial & payment internals)
const PANDIT_BOOKING_EXCLUDE = '-amount -razorpayOrderId -razorpayPaymentId -razorpaySignature -phonePeMerchantTransactionId -phonePeTransactionId -paymentProvider -panditRejections';

// POST /api/pandits/register
exports.register = async (req, res, next) => {
  try {
    const { name, email, phone, govtIdType, govtIdNumber, pincode, state, city, district, address, specializations, languages, bio, experience } = req.body;

    if (!req.file) return res.status(400).json({ success: false, message: 'Govt ID image is required' });

    // Check unique email/phone across pandits
    const emailExists = await Pandit.findOne({ email: email.toLowerCase() });
    if (emailExists) return res.status(400).json({ success: false, message: 'Email already registered as pandit' });

    const phoneExists = await Pandit.findOne({ phone });
    if (phoneExists) return res.status(400).json({ success: false, message: 'Phone already registered as pandit' });

    const pandit = await Pandit.create({
      userId:       req.user._id,
      name, phone,
      email:        email.toLowerCase(),
      govtIdType,
      govtIdNumber,
      govtIdImage:  `uploads/govtids/${req.file.filename}`,
      pincode, state, city, district, address,
      specializations: specializations ? JSON.parse(specializations) : [],
      languages:        languages        ? JSON.parse(languages)        : [],
      bio, experience,
      status: 'pending',
    });

    // Update user role to pandit
    await User.findByIdAndUpdate(req.user._id, { role: 'pandit' });

    res.status(201).json({
      success: true,
      message: 'Registration submitted! Aapki application under review mein hai. Hum jald hi aapse sampark karenge.',
      pandit,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/pandits/me  — pandit's own profile
exports.getMyProfile = async (req, res, next) => {
  try {
    const pandit = await Pandit.findOne({ userId: req.user._id });
    if (!pandit) return res.status(404).json({ success: false, message: 'Pandit profile not found' });
    res.json({ success: true, pandit });
  } catch (err) {
    next(err);
  }
};

// POST /api/pandits/me/kyc — submit KYC documents
exports.submitKYC = async (req, res, next) => {
  try {
    const { govtIdType, govtIdNumber } = req.body;
    const files = req.files || {};

    const pandit = await Pandit.findOne({ userId: req.user._id });
    if (!pandit) return res.status(404).json({ success: false, message: 'Pandit profile not found' });

    // Allow submission only when not already under review or approved
    if (pandit.kycStatus === 'submitted') {
      return res.status(400).json({ success: false, message: 'KYC already submitted. Please wait for admin review.' });
    }
    if (pandit.kycStatus === 'approved') {
      return res.status(400).json({ success: false, message: 'KYC already approved.' });
    }

    if (!govtIdType) {
      return res.status(400).json({ success: false, message: 'Government ID type is required' });
    }
    if (!files.frontImage) {
      return res.status(400).json({ success: false, message: 'Front image of document is required' });
    }

    const updates = {
      kycStatus:       'submitted',
      kycSubmittedAt:  new Date(),
      kycRejectionReason: '',
      govtIdType,
    };

    if (govtIdNumber)             updates.govtIdNumber   = govtIdNumber;
    if (files.frontImage?.[0])    updates.kycFrontImage  = `uploads/kycdocs/${files.frontImage[0].filename}`;
    if (files.backImage?.[0])     updates.kycBackImage   = `uploads/kycdocs/${files.backImage[0].filename}`;
    if (files.selfieImage?.[0])   updates.kycSelfieImage = `uploads/kycdocs/${files.selfieImage[0].filename}`;
    if (files.addressProof?.[0])  updates.kycAddressProof = `uploads/kycdocs/${files.addressProof[0].filename}`;

    // Sync legacy govtIdImage with front image for backward compat
    if (files.frontImage?.[0]) updates.govtIdImage = updates.kycFrontImage;

    const updated = await Pandit.findOneAndUpdate({ userId: req.user._id }, updates, { new: true });

    NotificationEngine.emit('KYC_SUBMITTED', normalizePanditPayload({ pandit })).catch(() => {});

    res.json({ success: true, message: 'KYC submitted successfully. Awaiting admin verification.', pandit: updated });
  } catch (err) {
    next(err);
  }
};

// GET /api/pandits/me/kyc/document/:field — stream a KYC document to its owner.
// Pre-approval this is a plain ownership-gated read (matches prior behavior).
// Once approved, access follows the Pandit's retention choice: deleted docs
// are gone for good, kept docs require a live OTP view session.
exports.getKycDocument = async (req, res, next) => {
  try {
    const dbField = KYC_FIELD_MAP[req.params.field];
    if (!dbField) return res.status(400).json({ success: false, message: 'Invalid document field' });

    const pandit = await Pandit.findOne({ userId: req.user._id });
    if (!pandit) return res.status(404).json({ success: false, message: 'Pandit profile not found' });

    if (pandit.kycStatus === 'approved') {
      if (pandit.kycDocumentRetention === 'deleted') {
        return res.status(404).json({ success: false, message: 'This document has been deleted per your privacy preference.' });
      }
      if (pandit.kycDocumentRetention !== 'kept') {
        return res.status(403).json({ success: false, message: 'Please choose whether to keep or delete your document first.' });
      }
      if (!pandit.kycViewSessionExpiresAt || pandit.kycViewSessionExpiresAt < new Date()) {
        return res.status(403).json({ success: false, code: 'OTP_REQUIRED', message: 'Verification required to view this document.' });
      }
    }

    const abs = resolveStoredFile(pandit[dbField]);
    if (!abs) return res.status(404).json({ success: false, message: 'Document not found' });

    res.set('Cache-Control', 'no-store');
    res.sendFile(abs);
  } catch (err) {
    next(err);
  }
};

// POST /api/pandits/me/kyc/document/send-otp — reuses the shared OTP model/
// service (see auth.controller.js send-otp / delete-account flows) under a
// dedicated purpose so it doesn't collide with registration/deletion OTPs.
exports.sendKycDocumentOtp = async (req, res, next) => {
  try {
    const { channel } = req.body;
    if (!['email', 'whatsapp'].includes(channel)) {
      return res.status(400).json({ success: false, message: 'Channel must be email or whatsapp' });
    }

    const pandit = await Pandit.findOne({ userId: req.user._id });
    if (!pandit) return res.status(404).json({ success: false, message: 'Pandit profile not found' });
    if (pandit.kycStatus !== 'approved' || pandit.kycDocumentRetention !== 'kept') {
      return res.status(400).json({ success: false, message: 'No retained document available to view' });
    }

    const identifier = channel === 'email' ? pandit.email?.toLowerCase() : pandit.phone;
    if (!identifier) {
      return res.status(400).json({ success: false, message: `No ${channel === 'email' ? 'email' : 'mobile number'} on file` });
    }

    const otp = OtpService.generate();
    await OTP.deleteMany({ identifier, purpose: KYC_OTP_PURPOSE });
    await OTP.create({ identifier, channel, otp, purpose: KYC_OTP_PURPOSE });

    await NotificationEngine.emit(
      'OTP_VERIFICATION',
      normalizeUserPayload({ user: { name: pandit.name, email: pandit.email, phone: pandit.phone }, otp, reason: 'kyc_document_view' }),
      { channel }
    ).catch(() => {});

    res.json({ success: true, message: `OTP sent to your registered ${channel === 'email' ? 'email' : 'mobile number'}` });
  } catch (err) {
    next(err);
  }
};

// POST /api/pandits/me/kyc/document/verify-otp — on success, opens a 5-minute
// viewing window (kycViewSessionExpiresAt) checked by getKycDocument above.
exports.verifyKycDocumentOtp = async (req, res, next) => {
  try {
    const { channel, otp } = req.body;
    if (!['email', 'whatsapp'].includes(channel) || !otp) {
      return res.status(400).json({ success: false, message: 'Channel and OTP are required' });
    }

    const pandit = await Pandit.findOne({ userId: req.user._id });
    if (!pandit) return res.status(404).json({ success: false, message: 'Pandit profile not found' });

    const identifier = channel === 'email' ? pandit.email?.toLowerCase() : pandit.phone;
    const record = await OTP.findOne({ identifier, purpose: KYC_OTP_PURPOSE });
    if (!record) {
      return res.status(400).json({ success: false, message: 'OTP expired or not found. Please request a new OTP.' });
    }
    if (OtpService.isRateLimited(record.attempts)) {
      await OTP.deleteOne({ _id: record._id });
      return res.status(400).json({ success: false, message: 'Too many attempts. Please request a new OTP.' });
    }
    if (!(await OtpService.compare(otp.trim(), record.otp, false))) {
      await OTP.findByIdAndUpdate(record._id, { $inc: { attempts: 1 } });
      return res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' });
    }

    await OTP.deleteOne({ _id: record._id });

    const viewSessionExpiresAt = new Date(Date.now() + KYC_VIEW_SESSION_MS);
    await Pandit.findByIdAndUpdate(pandit._id, { kycViewSessionExpiresAt: viewSessionExpiresAt });

    res.json({ success: true, message: 'Verified. You can view your document for the next 5 minutes.', viewSessionExpiresAt });
  } catch (err) {
    next(err);
  }
};

// POST /api/pandits/me/kyc/document-decision — the post-approval privacy
// choice. Deleting removes the files from disk and nulls the stored paths;
// verification metadata (status, dates, ID type, kycVerifiedBy) is untouched
// and the KYC approval itself is never affected either way.
exports.updateKycDocumentDecision = async (req, res, next) => {
  try {
    const { decision } = req.body;
    if (!['keep', 'delete'].includes(decision)) {
      return res.status(400).json({ success: false, message: 'decision must be "keep" or "delete"' });
    }

    const pandit = await Pandit.findOne({ userId: req.user._id });
    if (!pandit) return res.status(404).json({ success: false, message: 'Pandit profile not found' });
    if (pandit.kycStatus !== 'approved') {
      return res.status(400).json({ success: false, message: 'This choice is only available after KYC approval' });
    }
    if (pandit.kycDocumentRetention === 'deleted') {
      return res.status(400).json({ success: false, message: 'Document has already been deleted' });
    }

    const updates = { kycDocumentDecisionAt: new Date() };

    if (decision === 'delete') {
      [pandit.kycFrontImage, pandit.kycBackImage, pandit.kycSelfieImage, pandit.kycAddressProof, pandit.govtIdImage]
        .filter(Boolean)
        .forEach(deleteStoredFile);

      updates.kycFrontImage           = null;
      updates.kycBackImage            = null;
      updates.kycSelfieImage          = null;
      updates.kycAddressProof         = null;
      updates.govtIdImage             = null;
      updates.kycDocumentRetention    = 'deleted';
      updates.kycViewSessionExpiresAt = null;
    } else {
      updates.kycDocumentRetention = 'kept';
    }

    const updated = await Pandit.findOneAndUpdate({ userId: req.user._id }, updates, { new: true });
    res.json({
      success: true,
      message: decision === 'delete'
        ? 'Your uploaded document has been permanently deleted. Your KYC approval remains active.'
        : 'Your document will be kept securely. OTP verification will be required to view it.',
      pandit: updated,
    });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/pandits/me — update own profile (professional settings)
exports.updateMyProfile = async (req, res, next) => {
  try {
    const allowed = ['name', 'bio', 'experience', 'specializations', 'languages', 'pincode', 'state', 'city', 'district', 'address'];
    const updates = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const pandit = await Pandit.findOneAndUpdate({ userId: req.user._id }, updates, { new: true });
    res.json({ success: true, pandit });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/pandits/me/personal — update personal info (gender, dob, name, phone, location, fatherName, bio, lat/lng)
exports.updatePersonalInfo = async (req, res, next) => {
  try {
    const allowed = ['name', 'phone', 'gender', 'dob', 'fatherName', 'bio',
                     'pincode', 'state', 'city', 'district', 'address', 'latitude', 'longitude'];
    const updates = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const pandit = await Pandit.findOneAndUpdate({ userId: req.user._id }, updates, { new: true });
    if (updates.name || updates.phone) {
      const userUpdates = {};
      if (updates.name)  userUpdates.name  = updates.name;
      if (updates.phone) userUpdates.phone = updates.phone;
      await User.findByIdAndUpdate(req.user._id, userUpdates);
    }
    res.json({ success: true, pandit });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/pandits/me/languages-address — update languages, address, lat/lng, and service coverage
exports.updateLanguagesAddress = async (req, res, next) => {
  try {
    const { languages, pincode, state, city, district, address, latitude, longitude, serviceCoverage } = req.body;
    const updates = {};
    if (languages        !== undefined) updates.languages  = languages;
    if (pincode          !== undefined) updates.pincode    = pincode;
    if (state            !== undefined) updates.state      = state;
    if (city             !== undefined) updates.city       = city;
    if (district         !== undefined) updates.district   = district;
    if (address          !== undefined) updates.address    = address;
    if (latitude         !== undefined) updates.latitude   = latitude;
    if (longitude        !== undefined) updates.longitude  = longitude;
    if (serviceCoverage  !== undefined) updates.serviceCoverage = serviceCoverage;
    const pandit = await Pandit.findOneAndUpdate({ userId: req.user._id }, updates, { new: true });
    res.json({ success: true, pandit });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/pandits/me/qualifications
exports.updateQualifications = async (req, res, next) => {
  try {
    const { qualifications } = req.body;
    if (!Array.isArray(qualifications)) {
      return res.status(400).json({ success: false, message: 'qualifications must be an array' });
    }
    const pandit = await Pandit.findOneAndUpdate(
      { userId: req.user._id },
      { qualifications },
      { new: true }
    );
    res.json({ success: true, pandit });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/pandits/me/specializations — replace specializations (array of {name, yearsOfExperience})
exports.updateSpecializations = async (req, res, next) => {
  try {
    const { specializations, experience } = req.body;
    if (!Array.isArray(specializations)) {
      return res.status(400).json({ success: false, message: 'specializations must be an array' });
    }
    const updates = { specializations };
    if (experience !== undefined) updates.experience = experience;
    const pandit = await Pandit.findOneAndUpdate({ userId: req.user._id }, updates, { new: true });
    res.json({ success: true, pandit });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/pandits/me/family
exports.updateFamilyInfo = async (req, res, next) => {
  try {
    const { maritalStatus, spouseName, children, members } = req.body;
    const familyInfo = {};
    if (maritalStatus !== undefined) familyInfo.maritalStatus = maritalStatus;
    if (spouseName    !== undefined) familyInfo.spouseName    = spouseName;
    if (children      !== undefined) familyInfo.children      = children;
    if (members       !== undefined) familyInfo.members       = members;
    const pandit = await Pandit.findOneAndUpdate(
      { userId: req.user._id },
      { familyInfo },
      { new: true }
    );
    res.json({ success: true, pandit });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/pandits/me/upi
exports.updateUPI = async (req, res, next) => {
  try {
    const { upiId, verifiedName, bankName, isVerified } = req.body;
    const upiDetails = {};
    if (upiId        !== undefined) upiDetails.upiId        = upiId;
    if (verifiedName !== undefined) upiDetails.verifiedName = verifiedName;
    if (bankName     !== undefined) upiDetails.bankName     = bankName;
    if (isVerified   !== undefined) upiDetails.isVerified   = isVerified;

    // If UPI changed, reset verification
    if (upiId !== undefined) { upiDetails.isVerified = false; upiDetails.verifiedName = ''; upiDetails.bankName = ''; }

    const pandit = await Pandit.findOneAndUpdate(
      { userId: req.user._id },
      { upiDetails },
      { new: true }
    );
    res.json({ success: true, pandit });
  } catch (err) {
    next(err);
  }
};

const UPI_BANK_MAP = {
  paytm: 'Paytm Payments Bank', okhdfcbank: 'Google Pay (HDFC Bank)',
  okicici: 'Google Pay (ICICI Bank)', oksbi: 'Google Pay (SBI)',
  okaxis: 'Google Pay (Axis Bank)', ybl: 'PhonePe (Yes Bank)',
  idfcbank: 'PhonePe (IDFC Bank)', axisb: 'PhonePe (Axis Bank)',
  upi: 'BHIM UPI', sbin: 'State Bank of India', hdfc: 'HDFC Bank',
  icici: 'ICICI Bank', axis: 'Axis Bank', kotak: 'Kotak Mahindra Bank',
  pnb: 'Punjab National Bank', boi: 'Bank of India',
};

// POST /api/pandits/me/verify-upi
exports.verifyUPI = async (req, res, next) => {
  try {
    const { upiId } = req.body;
    if (!upiId) return res.status(400).json({ success: false, message: 'UPI ID is required' });

    const upiRegex = /^[a-zA-Z0-9._-]{3,256}@[a-zA-Z][a-zA-Z0-9]{2,63}$/;
    if (!upiRegex.test(upiId)) {
      return res.status(400).json({ success: false, message: 'Invalid UPI ID format. Use format: username@provider' });
    }

    const pandit = await Pandit.findOne({ userId: req.user._id });
    const provider = upiId.split('@')[1].toLowerCase();
    const bankName = UPI_BANK_MAP[provider] || `${upiId.split('@')[1].toUpperCase()} Bank`;
    const verifiedName = pandit.bankDetails?.accountHolderName || pandit.name;

    // Save verified info
    await Pandit.findOneAndUpdate(
      { userId: req.user._id },
      { upiDetails: { upiId, verifiedName, bankName, isVerified: true } }
    );

    res.json({ success: true, verifiedName, bankName, message: 'UPI ID verified successfully' });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/pandits/me/selected-poojas — update which admin poojas this pandit offers
exports.updateSelectedPoojas = async (req, res, next) => {
  try {
    const { selectedPoojas } = req.body;
    if (!Array.isArray(selectedPoojas)) {
      return res.status(400).json({ success: false, message: 'selectedPoojas must be an array of IDs' });
    }
    const pandit = await Pandit.findOneAndUpdate(
      { userId: req.user._id },
      { selectedPoojas },
      { new: true }
    ).populate('selectedPoojas', 'name categoryId duration');
    res.json({ success: true, pandit });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/pandits/me/pooja-charges — save expected charges per pooja
exports.updatePoojaCharges = async (req, res, next) => {
  try {
    const { poojaCharges } = req.body;
    if (!Array.isArray(poojaCharges)) {
      return res.status(400).json({ success: false, message: 'poojaCharges must be an array' });
    }
    const pandit = await Pandit.findOneAndUpdate(
      { userId: req.user._id },
      { poojaCharges },
      { new: true }
    );
    if (!pandit) return res.status(404).json({ success: false, message: 'Pandit profile not found' });
    res.json({ success: true, pandit });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/pandits/me/pooja-services — atomically save selection + expected charges
exports.updatePoojaServices = async (req, res, next) => {
  try {
    const { selectedPoojas, poojaCharges } = req.body;
    if (!Array.isArray(selectedPoojas)) {
      return res.status(400).json({ success: false, message: 'selectedPoojas must be an array' });
    }
    const pandit = await Pandit.findOne({ userId: req.user._id });
    if (!pandit) return res.status(404).json({ success: false, message: 'Pandit profile not found' });

    pandit.selectedPoojas = selectedPoojas;

    if (Array.isArray(poojaCharges)) {
      for (const { poojaId, expectedCharges } of poojaCharges) {
        const idx = pandit.poojaCharges.findIndex(
          (c) => c.poojaId && c.poojaId.toString() === poojaId.toString()
        );
        if (idx >= 0) {
          pandit.poojaCharges[idx].expectedCharges = +expectedCharges || 0;
        } else {
          pandit.poojaCharges.push({ poojaId, expectedCharges: +expectedCharges || 0 });
        }
      }
      // Remove charge entries for poojas no longer selected
      pandit.poojaCharges = pandit.poojaCharges.filter((c) =>
        c.poojaId && selectedPoojas.some((id) => id.toString() === c.poojaId.toString())
      );
    }

    await pandit.save();
    res.json({ success: true, message: 'Pooja services updated', pandit });
  } catch (err) {
    next(err);
  }
};

// Delegate OTP-based completion to booking controller
const { requestCompletion: _reqCompletion, verifyCompletionOtp: _verifyOtp } = require('./booking.controller');
exports.requestCompletion    = _reqCompletion;
exports.verifyCompletionOtp  = _verifyOtp;

// PATCH /api/pandits/me/bookings/:id/accept — pandit confirms they will perform the pooja
exports.acceptBooking = async (req, res, next) => {
  try {
    const pandit = await Pandit.findOne({ userId: req.user._id }).select('_id name phone');
    if (!pandit) return res.status(404).json({ success: false, message: 'Pandit profile not found' });

    const booking = await Booking.findOne({ _id: req.params.id, panditId: pandit._id, status: 'pandit_assigned' })
      .populate('poojaId', 'name');
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found, not assigned to you, or cannot be accepted in its current state' });
    }

    booking.status = 'pandit_accepted';
    booking.auditLog.push({
      action:          'pandit_accepted',
      performedBy:     req.user._id,
      performedByName: pandit.name,
      note:            'Pandit accepted the booking',
      at:              new Date(),
    });
    await booking.save();

    NotificationEngine.emit(
      'PANDIT_ACCEPTED',
      normalizeBookingPayload({
        booking,
        pandit: { userId: req.user._id, name: pandit.name, phone: pandit.phone },
        poojaName: booking.poojaId?.name || '',
      })
    ).catch(() => {});

    res.json({ success: true, booking });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/pandits/me/bookings/:id/reject — pandit declines, triggers admin reassignment
exports.rejectBooking = async (req, res, next) => {
  try {
    const { reason } = req.body;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required and must be at least 10 characters' });
    }

    const pandit = await Pandit.findOne({ userId: req.user._id }).select('_id name');
    if (!pandit) return res.status(404).json({ success: false, message: 'Pandit profile not found' });

    const booking = await Booking.findOne({ _id: req.params.id, panditId: pandit._id, status: 'pandit_assigned' });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found, not assigned to you, or cannot be rejected in its current state' });
    }

    const trimmedReason = reason.trim();

    // Record the rejection so this pandit is excluded from future assignment on this booking
    booking.panditRejections.push({
      panditId:   pandit._id,
      panditName: pandit.name,
      reason:     trimmedReason,
      rejectedAt: new Date(),
    });
    booking.panditId = null;
    booking.status   = 'pending_reassignment';
    booking.auditLog.push({
      action:          'pandit_rejected',
      performedBy:     req.user._id,
      performedByName: pandit.name,
      note:            `Rejection reason: ${trimmedReason}`,
      at:              new Date(),
    });
    await booking.save();

    NotificationEngine.emit(
      'PANDIT_REJECTED',
      normalizeBookingPayload({
        booking,
        pandit: { userId: req.user._id, name: pandit.name },
        reason: trimmedReason,
      })
    ).catch(() => {});

    res.json({ success: true, booking });
  } catch (err) {
    next(err);
  }
};

// GET /api/pandits/catalog-poojas — admin-approved poojas for pandit to select from
exports.getCatalogPoojas = async (req, res, next) => {
  try {
    const { search, categoryId } = req.query;
    const query = { createdByRole: 'admin', approvalStatus: 'approved', isActive: true };
    if (categoryId) query.categoryId = categoryId;
    if (search)     query.name = { $regex: search, $options: 'i' };
    const poojas = await Pooja.find(query)
      .populate('categoryId', 'name')
      .select('name description duration categoryId image')
      .sort({ name: 1 });
    res.json({ success: true, poojas });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/pandits/me/bank — update bank details
exports.updateBankDetails = async (req, res, next) => {
  try {
    const { accountHolderName, accountNumber, ifscCode, bankName } = req.body;
    const pandit = await Pandit.findOneAndUpdate(
      { userId: req.user._id },
      { bankDetails: { accountHolderName, accountNumber, ifscCode, bankName } },
      { new: true }
    );
    res.json({ success: true, message: 'Bank details updated', pandit });
  } catch (err) {
    next(err);
  }
};

// POST /api/pandits/me/photo
exports.uploadPhoto = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const pandit = await Pandit.findOne({ userId: req.user._id });
    if (pandit?.profilePhoto) {
      const old = path.join(__dirname, '../../', pandit.profilePhoto);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
    const updated = await Pandit.findOneAndUpdate(
      { userId: req.user._id },
      { profilePhoto: `uploads/profiles/${req.file.filename}` },
      { new: true }
    );
    res.json({ success: true, pandit: updated });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/pandits/me/photo
exports.removePhoto = async (req, res, next) => {
  try {
    const pandit = await Pandit.findOne({ userId: req.user._id });
    if (pandit?.profilePhoto) {
      const old = path.join(__dirname, '../../', pandit.profilePhoto);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
    const updated = await Pandit.findOneAndUpdate({ userId: req.user._id }, { profilePhoto: null }, { new: true });
    res.json({ success: true, pandit: updated });
  } catch (err) {
    next(err);
  }
};

// GET /api/pandits  — public list of approved pandits
exports.getAll = async (req, res, next) => {
  try {
    const { page = 1, limit = 12, specialization } = req.query;
    const query = { status: 'approved' };
    if (specialization) query['specializations.name'] = { $regex: specialization, $options: 'i' };

    const pandits = await Pandit.find(query)
      .populate('userId', 'name profilePhoto')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ rating: -1 });

    const total = await Pandit.countDocuments(query);
    res.json({ success: true, pandits, total, page: +page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
};

// ─── Availability Management ────────────────────────────────

// POST /api/pandits/me/availability
exports.addAvailability = async (req, res, next) => {
  try {
    const { startDate, endDate, daysOfWeek, timeSlots } = req.body;
    const pandit = await Pandit.findOneAndUpdate(
      { userId: req.user._id },
      { $push: { availabilitySlots: { startDate, endDate, daysOfWeek, timeSlots, isActive: true } } },
      { new: true }
    );
    res.json({ success: true, pandit });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/pandits/me/availability/:slotId
exports.updateAvailability = async (req, res, next) => {
  try {
    const { slotId } = req.params;
    const updates = req.body;
    const setObj = {};
    Object.keys(updates).forEach((k) => { setObj[`availabilitySlots.$.${k}`] = updates[k]; });

    const pandit = await Pandit.findOneAndUpdate(
      { userId: req.user._id, 'availabilitySlots._id': slotId },
      { $set: setObj },
      { new: true }
    );
    res.json({ success: true, pandit });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/pandits/me/availability/:slotId
exports.deleteAvailability = async (req, res, next) => {
  try {
    const pandit = await Pandit.findOneAndUpdate(
      { userId: req.user._id },
      { $pull: { availabilitySlots: { _id: req.params.slotId } } },
      { new: true }
    );
    res.json({ success: true, pandit });
  } catch (err) {
    next(err);
  }
};

// POST /api/pandits/me/block   — block a period despite availability
exports.blockPeriod = async (req, res, next) => {
  try {
    const { startDate, endDate, reason, title } = req.body;
    const pandit = await Pandit.findOneAndUpdate(
      { userId: req.user._id },
      { $push: { blockedPeriods: { startDate, endDate, reason, title: title || '' } } },
      { new: true }
    );
    res.json({ success: true, message: 'Period blocked successfully', pandit });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/pandits/me/block/:blockId
exports.unblockPeriod = async (req, res, next) => {
  try {
    const pandit = await Pandit.findOneAndUpdate(
      { userId: req.user._id },
      { $pull: { blockedPeriods: { _id: req.params.blockId } } },
      { new: true }
    );
    res.json({ success: true, pandit });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/pandits/me/online-status
exports.setOnlineStatus = async (req, res, next) => {
  try {
    const { isOnline } = req.body;
    const pandit = await Pandit.findOneAndUpdate(
      { userId: req.user._id },
      { isOnline },
      { new: true }
    );
    res.json({ success: true, pandit });
  } catch (err) {
    next(err);
  }
};

// ─── New structured availability endpoints ───────────────────

// PUT /api/pandits/me/weekly-schedule  — replace entire weekly schedule
exports.setWeeklySchedule = async (req, res, next) => {
  try {
    const { weeklySchedule } = req.body;
    if (!Array.isArray(weeklySchedule)) {
      return res.status(400).json({ success: false, message: 'weeklySchedule must be an array' });
    }
    const pandit = await Pandit.findOneAndUpdate(
      { userId: req.user._id },
      { weeklySchedule },
      { new: true }
    );
    res.json({ success: true, pandit });
  } catch (err) {
    next(err);
  }
};

// POST /api/pandits/me/special-dates  — add or upsert a special date
exports.addSpecialDate = async (req, res, next) => {
  try {
    const { date, type, slots } = req.body;
    const dateObj = new Date(date);
    dateObj.setHours(0, 0, 0, 0);

    // Remove any existing entry for the same date first
    await Pandit.findOneAndUpdate(
      { userId: req.user._id },
      { $pull: { specialDates: { date: { $gte: dateObj, $lt: new Date(dateObj.getTime() + 86400000) } } } }
    );

    const pandit = await Pandit.findOneAndUpdate(
      { userId: req.user._id },
      { $push: { specialDates: { date: dateObj, type, slots: slots || [] } } },
      { new: true }
    );
    res.json({ success: true, pandit });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/pandits/me/special-dates/:id
exports.deleteSpecialDate = async (req, res, next) => {
  try {
    const pandit = await Pandit.findOneAndUpdate(
      { userId: req.user._id },
      { $pull: { specialDates: { _id: req.params.id } } },
      { new: true }
    );
    res.json({ success: true, pandit });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/pandits/me/toggle-availability  — global on/off switch
exports.toggleAvailability = async (req, res, next) => {
  try {
    const { isAvailableForBookings } = req.body;
    const pandit = await Pandit.findOneAndUpdate(
      { userId: req.user._id },
      { isAvailableForBookings },
      { new: true }
    );
    res.json({ success: true, pandit });
  } catch (err) {
    next(err);
  }
};

// GET /api/pandits/me/ratings  — completed bookings with user ratings (for pandit's review history)
exports.getRatingHistory = async (req, res, next) => {
  try {
    const pandit = await Pandit.findOne({ userId: req.user._id }).select('_id rating totalReviews');
    if (!pandit) return res.status(404).json({ success: false, message: 'Pandit profile not found' });

    const ratings = await Booking.find({
      panditId: pandit._id,
      status:   'completed',
      rating:   { $ne: null },
    })
      .select('bookingNumber poojaId scheduledDate rating review ratingDate completedAt')
      .populate('poojaId', 'name')
      .sort({ ratingDate: -1 });

    res.json({
      success:      true,
      ratings,
      averageRating: pandit.rating,
      totalReviews:  pandit.totalReviews,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/pandits/me/bookings  — bookings assigned to this pandit
// NOTE: Booking.panditId stores Pandit._id (not User._id).
// req.user._id is the User._id, so we must first look up the Pandit document.
exports.getMyBookings = async (req, res, next) => {
  try {
    // Step 1 — resolve User._id → Pandit._id
    const pandit = await Pandit.findOne({ userId: req.user._id }).select('_id name poojaCharges');
    if (!pandit) {
      return res.status(404).json({ success: false, message: 'Pandit profile not found' });
    }

    console.log(`[Pandit Bookings] Fetching bookings for panditId: ${pandit._id}`);

    const { page = 1, limit = 20, status, search } = req.query;
    const query = { panditId: pandit._id };
    if (status) query.status = status;
    if (search) {
      const s = search.trim();
      query.$or = [
        { bookingNumber: { $regex: s, $options: 'i' } },
        { 'userDetails.name': { $regex: s, $options: 'i' } },
        { 'userDetails.phone': { $regex: s, $options: 'i' } },
      ];
    }

    // Re-include panditRejections just long enough to derive a `wasReassigned`
    // flag — the raw array (other pandits' names/reasons) is still never sent.
    const selectForList = PANDIT_BOOKING_EXCLUDE.replace(' -panditRejections', '');

    const [rawBookings, total] = await Promise.all([
      Booking.find(query)
        .select(selectForList)
        .populate('poojaId', 'name image duration')
        .populate('userId',  'name phone email')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean(),
      Booking.countDocuments(query),
    ]);

    const bookings = rawBookings.map((b) => {
      const wasReassigned = (b.panditRejections?.length || 0) > 0;
      delete b.panditRejections;
      // Admin-approved rate for this pooja — same resolver used for the actual
      // payout at completion, never the pandit's own self-declared expected price.
      const approvedFee = resolveApprovedPayoutAmount(b, pandit);
      return { ...b, wasReassigned, approvedFee };
    });

    console.log(`[Pandit Bookings] Total bookings found: ${total}`);

    res.json({ success: true, bookings, total, page: +page });
  } catch (err) {
    next(err);
  }
};

// Referral endpoints have moved to /api/referrals — see referral.routes.js

// Zero-pads a day-bucketed aggregation into a continuous `days`-long series,
// so a chart doesn't show gaps for days with no completed bookings.
function fillDaySeries(rows, days) {
  const map = new Map(rows.map((r) => [r._id, r.value]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, value: map.get(key) || 0 });
  }
  return out;
}

// GET /api/pandits/me/dashboard
exports.getMyDashboard = async (req, res, next) => {
  try {
    const pandit = await Pandit.findOne({ userId: req.user._id })
      .select('_id name rating totalReviews kycStatus isAvailableForBookings isOnline poojaCharges');
    if (!pandit) return res.status(404).json({ success: false, message: 'Pandit profile not found' });

    await healPanditPendingPayouts(pandit._id, pandit);

    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const endOfToday    = new Date(startOfToday.getTime() + 86400000);
    const start30        = new Date(Date.now() - 29 * 86400000);
    const start12mo       = new Date(); start12mo.setMonth(start12mo.getMonth() - 11); start12mo.setDate(1); start12mo.setHours(0, 0, 0, 0);
    const startOfMonth    = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);

    const ACTIVE_STATUSES = ['pandit_assigned', 'pandit_accepted', 'completion_requested'];

    const [
      todayBookings, todayEarnings, upcomingBookings,
      monthEarnings, dailyTrend, monthlyTrend,
      totalAssigned, acceptedEver, rejectedEver, completedCount,
      repeatCustomers, pendingRemarkCount,
    ] = await Promise.all([
      Booking.find({ panditId: pandit._id, scheduledDate: { $gte: startOfToday, $lt: endOfToday } })
        .populate('poojaId', 'name').populate('userId', 'name').select('bookingNumber status scheduledDate poojaId userId'),
      Booking.aggregate([
        { $match: { panditId: pandit._id, status: 'completed', verifiedAt: { $gte: startOfToday, $lt: endOfToday } } },
        { $group: { _id: null, total: { $sum: '$payout.amount' } } },
      ]),
      Booking.find({ panditId: pandit._id, status: { $in: ACTIVE_STATUSES }, scheduledDate: { $gte: endOfToday } })
        .sort({ scheduledDate: 1 }).limit(10)
        .populate('poojaId', 'name').populate('userId', 'name').select('bookingNumber status scheduledDate poojaId userId'),
      Booking.aggregate([
        { $match: { panditId: pandit._id, status: 'completed', verifiedAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$payout.amount' } } },
      ]),
      Booking.aggregate([
        { $match: { panditId: pandit._id, status: 'completed', verifiedAt: { $gte: start30 } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$verifiedAt' } }, value: { $sum: '$payout.amount' } } },
      ]),
      Booking.aggregate([
        { $match: { panditId: pandit._id, status: 'completed', verifiedAt: { $gte: start12mo } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$verifiedAt' } }, value: { $sum: '$payout.amount' } } },
      ]),
      Booking.countDocuments({ panditId: pandit._id }),
      Booking.countDocuments({ auditLog: { $elemMatch: { action: 'pandit_accepted', performedBy: req.user._id } } }),
      Booking.countDocuments({ 'panditRejections.panditId': pandit._id }),
      Booking.countDocuments({ panditId: pandit._id, status: 'completed' }),
      Booking.aggregate([
        { $match: { panditId: pandit._id, status: 'completed' } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $count: 'repeatCustomers' },
      ]),
      Referral.countDocuments({ panditId: pandit._id, status: 'PENDING_REMARK' }),
    ]);

    const completionRate = totalAssigned > 0 ? Math.round((completedCount / totalAssigned) * 100) : 0;

    res.json({
      success: true,
      profile: {
        name: pandit.name, rating: pandit.rating, totalReviews: pandit.totalReviews,
        kycStatus: pandit.kycStatus, isAvailableForBookings: pandit.isAvailableForBookings, isOnline: pandit.isOnline,
      },
      today:    { bookings: todayBookings, earnings: todayEarnings[0]?.total || 0 },
      upcoming: { bookings: upcomingBookings },
      monthly:  { earnings: monthEarnings[0]?.total || 0 },
      trends:   { daily: fillDaySeries(dailyTrend, 30), monthly: monthlyTrend },
      pending:  { referralRemarks: pendingRemarkCount },
      performance: {
        totalAssigned, accepted: acceptedEver, rejected: rejectedEver, completed: completedCount,
        completionRate, repeatCustomers: repeatCustomers[0]?.repeatCustomers || 0,
      },
    });
  } catch (err) { next(err); }
};

// ─── Payout Endpoints (pandit's own view) ────────────────────

// GET /api/pandits/me/payouts/stats
exports.getPayoutStats = async (req, res, next) => {
  try {
    const pandit = await Pandit.findOne({ userId: req.user._id }).select('_id poojaCharges');
    if (!pandit) return res.status(404).json({ success: false, message: 'Pandit profile not found' });

    await healPanditPendingPayouts(pandit._id, pandit);

    const [totalEarned, pendingAmt, paidAmt, pendingCount, paidCount] = await Promise.all([
      Booking.aggregate([
        { $match: { panditId: pandit._id, status: 'completed', 'payout.status': { $in: ['pending', 'completed'] } } },
        { $group: { _id: null, total: { $sum: '$payout.amount' } } },
      ]),
      Booking.aggregate([
        { $match: { panditId: pandit._id, status: 'completed', 'payout.status': 'pending' } },
        { $group: { _id: null, total: { $sum: '$payout.amount' } } },
      ]),
      PayoutBatch.aggregate([
        { $match: { panditId: pandit._id } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      Booking.countDocuments({ panditId: pandit._id, status: 'completed', 'payout.status': 'pending' }),
      PayoutBatch.countDocuments({ panditId: pandit._id }),
    ]);

    res.json({
      success: true,
      stats: {
        totalEarned:  totalEarned[0]?.total  || 0,
        pendingAmount: pendingAmt[0]?.total  || 0,
        paidAmount:   paidAmt[0]?.total      || 0,
        pendingCount,
        paidCount,
      },
    });
  } catch (err) { next(err); }
};

// GET /api/pandits/me/payouts/pending
exports.getPendingPayouts = async (req, res, next) => {
  try {
    const pandit = await Pandit.findOne({ userId: req.user._id }).select('_id poojaCharges');
    if (!pandit) return res.status(404).json({ success: false, message: 'Pandit profile not found' });

    await healPanditPendingPayouts(pandit._id, pandit);

    const bookings = await Booking.find({
      panditId:        pandit._id,
      status:          'completed',
      'payout.status': 'pending',
    })
      .populate('poojaId', 'name')
      .populate('userId', 'name')
      .select('bookingNumber poojaId userId scheduledDate verifiedAt payout')
      .sort({ verifiedAt: -1 });

    // approvedPayout/status are always derived from payout.amount — the pandit
    // never sees a figure the admin hasn't actually approved.
    const withStatus = bookings.map((b) => ({
      ...b.toObject(),
      approvedPayout: b.payout?.amount || 0,
      status:         getPanditPayoutStatusLabel(b),
    }));

    res.json({ success: true, bookings: withStatus });
  } catch (err) { next(err); }
};

// GET /api/pandits/me/payouts/history
exports.getPayoutHistory = async (req, res, next) => {
  try {
    const pandit = await Pandit.findOne({ userId: req.user._id }).select('_id');
    if (!pandit) return res.status(404).json({ success: false, message: 'Pandit profile not found' });

    const batches = await PayoutBatch.find({ panditId: pandit._id })
      .sort({ paidDate: -1 })
      .lean();

    // Populate booking details for each batch
    const batchesWithBookings = await Promise.all(
      batches.map(async (batch) => {
        const bookings = await Booking.find({ _id: { $in: batch.bookingIds } })
          .populate('poojaId', 'name')
          .select('bookingNumber poojaId scheduledDate payout.amount');
        return { ...batch, bookings };
      })
    );

    res.json({ success: true, batches: batchesWithBookings });
  } catch (err) { next(err); }
};
