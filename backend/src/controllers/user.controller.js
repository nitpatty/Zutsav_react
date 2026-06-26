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
