const User = require('../models/User');
const path = require('path');
const fs = require('fs');

// GET /api/users/profile
exports.getProfile = async (req, res) => {
  res.json({ success: true, user: req.user });
};

// PATCH /api/users/profile
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, email, pincode, state, city, district, address } = req.body;
    const updates = {};

    if (name)     updates.name     = name;
    if (pincode)  updates.pincode  = pincode;
    if (state)    updates.state    = state;
    if (city)     updates.city     = city;
    if (district) updates.district = district;
    if (address)  updates.address  = address;

    if (email && email !== req.user.email) {
      const exists = await User.findOne({ email: email.toLowerCase() });
      if (exists) return res.status(400).json({ success: false, message: 'Email already in use' });
      updates.email = email.toLowerCase();
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

// POST /api/users/profile/photo
exports.uploadPhoto = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    // Remove old photo
    if (req.user.profilePhoto) {
      const oldPath = path.join(__dirname, '../../', req.user.profilePhoto);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const photoPath = `uploads/profiles/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(req.user._id, { profilePhoto: photoPath }, { new: true });
    res.json({ success: true, profilePhoto: photoPath, user });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/users/profile/photo
exports.removePhoto = async (req, res, next) => {
  try {
    if (req.user.profilePhoto) {
      const filePath = path.join(__dirname, '../../', req.user.profilePhoto);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    const user = await User.findByIdAndUpdate(req.user._id, { profilePhoto: null }, { new: true });
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

// GET /api/users/addresses
exports.getAddresses = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('savedAddresses');
    res.json({ success: true, addresses: user.savedAddresses || [] });
  } catch (err) { next(err); }
};

// POST /api/users/addresses
exports.addAddress = async (req, res, next) => {
  try {
    const { label = 'Home', address, pincode, state, city, district, setDefault = false } = req.body;
    if (!address) return res.status(400).json({ success: false, message: 'Address is required' });

    const user = await User.findById(req.user._id);
    if (setDefault) user.savedAddresses.forEach(a => { a.isDefault = false; });

    user.savedAddresses.push({ label, address, pincode, state, city, district, isDefault: setDefault || user.savedAddresses.length === 0 });
    await user.save();
    res.json({ success: true, addresses: user.savedAddresses });
  } catch (err) { next(err); }
};

// PATCH /api/users/addresses/:addrId
exports.updateAddress = async (req, res, next) => {
  try {
    const { label, address, pincode, state, city, district, isDefault } = req.body;
    const user = await User.findById(req.user._id);
    const addr = user.savedAddresses.id(req.params.addrId);
    if (!addr) return res.status(404).json({ success: false, message: 'Address not found' });

    if (label !== undefined)    addr.label    = label;
    if (address !== undefined)  addr.address  = address;
    if (pincode !== undefined)  addr.pincode  = pincode;
    if (state !== undefined)    addr.state    = state;
    if (city !== undefined)     addr.city     = city;
    if (district !== undefined) addr.district = district;

    if (isDefault === true) {
      user.savedAddresses.forEach(a => { a.isDefault = String(a._id) === req.params.addrId; });
    } else if (isDefault === false) {
      addr.isDefault = false;
    }

    await user.save();
    res.json({ success: true, addresses: user.savedAddresses });
  } catch (err) { next(err); }
};

// DELETE /api/users/addresses/:addrId
exports.deleteAddress = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    user.savedAddresses = user.savedAddresses.filter(a => String(a._id) !== req.params.addrId);
    await user.save();
    res.json({ success: true, addresses: user.savedAddresses });
  } catch (err) { next(err); }
};

// PATCH /api/users/change-password
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(currentPassword))) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
};

// ── Family Members ────────────────────────────────────────────────────────
// Ownership lives entirely in the parent User document — no per-member userId.
// CRUD mirrors the savedAddresses embedded-array pattern.

const RELATIONSHIP_ENUM = [
  'Father', 'Mother', 'Son', 'Daughter', 'Spouse',
  'Brother', 'Sister', 'Grandfather', 'Grandmother', 'Other',
];

// GET /api/users/family-members
exports.getFamilyMembers = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('familyMembers');
    res.json({ success: true, familyMembers: user.familyMembers || [] });
  } catch (err) { next(err); }
};

// POST /api/users/family-members
exports.addFamilyMember = async (req, res, next) => {
  try {
    const { name, relationship, dateOfBirth } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    if (!relationship || !relationship.trim()) {
      return res.status(400).json({ success: false, message: 'Relationship is required' });
    }
    if (!RELATIONSHIP_ENUM.includes(relationship.trim())) {
      return res.status(400).json({ success: false, message: `Invalid relationship. Must be one of: ${RELATIONSHIP_ENUM.join(', ')}` });
    }

    const user = await User.findById(req.user._id);
    user.familyMembers.push({
      name: name.trim(),
      relationship: relationship.trim(),
      dateOfBirth: dateOfBirth || null,
    });
    await user.save();
    res.status(201).json({ success: true, familyMembers: user.familyMembers });
  } catch (err) { next(err); }
};

// PATCH /api/users/family-members/:memberId
exports.updateFamilyMember = async (req, res, next) => {
  try {
    const { name, relationship, dateOfBirth } = req.body;
    const user = await User.findById(req.user._id);
    const member = user.familyMembers.id(req.params.memberId);
    if (!member) {
      return res.status(404).json({ success: false, message: 'Family member not found' });
    }

    if (name !== undefined) {
      if (!name || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Name cannot be empty' });
      }
      member.name = name.trim();
    }
    if (relationship !== undefined) {
      if (!relationship || !relationship.trim()) {
        return res.status(400).json({ success: false, message: 'Relationship cannot be empty' });
      }
      if (!RELATIONSHIP_ENUM.includes(relationship.trim())) {
        return res.status(400).json({ success: false, message: `Invalid relationship. Must be one of: ${RELATIONSHIP_ENUM.join(', ')}` });
      }
      member.relationship = relationship.trim();
    }
    if (dateOfBirth !== undefined) {
      member.dateOfBirth = dateOfBirth || null;
    }

    await user.save();
    res.json({ success: true, familyMembers: user.familyMembers });
  } catch (err) { next(err); }
};

// DELETE /api/users/family-members/:memberId
exports.deleteFamilyMember = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const member = user.familyMembers.id(req.params.memberId);
    if (!member) {
      return res.status(404).json({ success: false, message: 'Family member not found' });
    }

    user.familyMembers = user.familyMembers.filter(
      (m) => String(m._id) !== req.params.memberId
    );
    await user.save();
    res.json({ success: true, familyMembers: user.familyMembers });
  } catch (err) { next(err); }
};
