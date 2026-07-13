const path = require('path');
const fs = require('fs');
const HeroBanner = require('../models/HeroBanner');

// GET /api/hero-banners — public
exports.getPublicBanners = async (req, res, next) => {
  try {
    const banners = await HeroBanner.find({ isActive: true }).sort({ sortOrder: 1 });
    res.json({ success: true, banners });
  } catch (err) { next(err); }
};

// GET /api/hero-banners/admin — admin
exports.getAdminBanners = async (req, res, next) => {
  try {
    const banners = await HeroBanner.find({}).sort({ sortOrder: 1 });
    res.json({ success: true, banners });
  } catch (err) { next(err); }
};

// POST /api/hero-banners — admin
exports.createBanner = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Banner image is required' });

    const { altText = '', linkUrl = '' } = req.body;
    const image = `uploads/herobanners/${req.file.filename}`;
    const maxOrder = await HeroBanner.findOne({}).sort({ sortOrder: -1 }).select('sortOrder').lean();
    const sortOrder = maxOrder ? maxOrder.sortOrder + 1 : 0;

    const banner = await HeroBanner.create({ image, altText, linkUrl, sortOrder });
    res.status(201).json({ success: true, banner });
  } catch (err) { next(err); }
};

// PATCH /api/hero-banners/:id — admin
exports.updateBanner = async (req, res, next) => {
  try {
    const existing = await HeroBanner.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Banner not found' });

    const updates = { ...req.body };
    if (updates.isActive !== undefined) updates.isActive = updates.isActive === 'true' || updates.isActive === true;

    if (req.file) {
      updates.image = `uploads/herobanners/${req.file.filename}`;
      const oldPath = path.join(__dirname, '../../', existing.image);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const banner = await HeroBanner.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json({ success: true, banner });
  } catch (err) { next(err); }
};

// PATCH /api/hero-banners/reorder — admin
exports.reorderBanners = async (req, res, next) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ success: false, message: 'order must be an array of banner ids' });

    await Promise.all(order.map((id, index) =>
      HeroBanner.findByIdAndUpdate(id, { sortOrder: index })
    ));

    const banners = await HeroBanner.find({}).sort({ sortOrder: 1 });
    res.json({ success: true, banners });
  } catch (err) { next(err); }
};

// DELETE /api/hero-banners/:id — admin
exports.deleteBanner = async (req, res, next) => {
  try {
    const banner = await HeroBanner.findById(req.params.id);
    if (!banner) return res.status(404).json({ success: false, message: 'Banner not found' });

    const filePath = path.join(__dirname, '../../', banner.image);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await HeroBanner.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Banner deleted' });
  } catch (err) { next(err); }
};
