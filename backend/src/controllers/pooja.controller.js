const PoojaCategory = require('../models/PoojaCategory');
const Pooja         = require('../models/Pooja');
const Booking       = require('../models/Booking');
const AdminAuditLog = require('../models/AdminAuditLog');

const auditLog = (req, action, target, note = '') =>
  AdminAuditLog.create({
    action,
    performedBy:     req.user._id,
    performedByName: req.user.name || req.user.email || 'Admin',
    targetId:        target._id,
    targetType:      'pooja',
    targetName:      target.name,
    note,
  }).catch(() => {});

// ── Categories ────────────────────────────────────────────────

exports.getCategories = async (req, res, next) => {
  try {
    const categories = await PoojaCategory.find({ isActive: true }).sort({ sortOrder: 1 });
    res.json({ success: true, categories });
  } catch (err) { next(err); }
};

exports.createCategory = async (req, res, next) => {
  try {
    const { name, description, sortOrder } = req.body;
    const slug  = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const image = req.file ? `uploads/profiles/${req.file.filename}` : null;
    const cat   = await PoojaCategory.create({ name, slug, description, image, sortOrder });
    res.status(201).json({ success: true, category: cat });
  } catch (err) { next(err); }
};

exports.updateCategory = async (req, res, next) => {
  try {
    const updates = req.body;
    if (req.file) updates.image = `uploads/profiles/${req.file.filename}`;
    const cat = await PoojaCategory.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json({ success: true, category: cat });
  } catch (err) { next(err); }
};

exports.deleteCategory = async (req, res, next) => {
  try {
    await PoojaCategory.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Category deactivated' });
  } catch (err) { next(err); }
};

// ── Helpers ───────────────────────────────────────────────────

function parseCategoryIds(categoryIds, categoryId) {
  if (categoryIds) {
    const arr = typeof categoryIds === 'string' ? JSON.parse(categoryIds) : categoryIds;
    return Array.isArray(arr) ? arr : [arr];
  }
  if (categoryId) return [categoryId];
  return [];
}

function makeBaseSlug(name) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

async function uniqueSlug(baseName, excludeId = null) {
  const base = makeBaseSlug(baseName);
  let slug    = base;
  let counter = 1;
  while (true) {
    const query = { slug };
    if (excludeId) query._id = { $ne: excludeId };
    const exists = await Pooja.findOne(query).select('_id').lean();
    if (!exists) return slug;
    slug = `${base}-${counter++}`;
  }
}

// ── Public Poojas ─────────────────────────────────────────────

exports.getPoojas = async (req, res, next) => {
  try {
    const { categoryId, featured, page = 1, limit = 12, search } = req.query;
    const query = { isActive: true, approvalStatus: 'approved', isDeleted: { $ne: true } };
    if (categoryId) {
      // Match poojas that have this category in either legacy or multi-category fields
      query.$or = [{ categoryId }, { categoryIds: categoryId }];
    }
    if (featured === 'true') query.isFeatured = true;
    if (search) query.name = new RegExp(search, 'i');

    const poojas = await Pooja.find(query)
      .populate('categoryIds', 'name slug')
      .populate('categoryId', 'name slug')
      .sort({ isFeatured: -1, totalBookings: -1 })
      .limit(+limit)
      .skip((+page - 1) * +limit);

    const total = await Pooja.countDocuments(query);
    res.json({ success: true, poojas, total, page: +page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
};

exports.getPoojaBySlug = async (req, res, next) => {
  try {
    const pooja = await Pooja.findOne({
      slug:           req.params.slug,
      isActive:       true,
      approvalStatus: 'approved',
      isDeleted:      { $ne: true },
    })
      .populate('categoryIds', 'name slug')
      .populate('categoryId',  'name slug');
    if (!pooja) return res.status(404).json({ success: false, message: 'Pooja not found' });
    res.json({ success: true, pooja });
  } catch (err) { next(err); }
};

// ── Admin Poojas ──────────────────────────────────────────────

exports.getAdminPoojas = async (req, res, next) => {
  try {
    const { search, status, categoryId } = req.query;
    const query = {};

    if (status === 'active')    { query.isActive = true;  query.isDeleted = { $ne: true }; }
    else if (status === 'inactive') { query.isActive = false; query.isDeleted = { $ne: true }; }
    else if (status === 'deleted')  { query.isDeleted = true; }
    else if (status === 'featured') { query.isFeatured = true; query.isDeleted = { $ne: true }; }
    else query.isDeleted = { $ne: true };

    if (categoryId) query.$or = [{ categoryId }, { categoryIds: categoryId }];
    if (search) query.name = new RegExp(search, 'i');

    const poojas = await Pooja.find(query)
      .populate('categoryIds', 'name')
      .populate('categoryId',  'name')
      .sort({ createdAt: -1 })
      .limit(200);

    res.json({ success: true, poojas });
  } catch (err) { next(err); }
};

exports.createPooja = async (req, res, next) => {
  try {
    const {
      name, categoryId, categoryIds: rawCatIds,
      description, shortDesc, price, mrp, salePrice,
      taxEnabled, taxRate,
      durationValue, durationUnit,
      requirements, benefits, languages,
    } = req.body;

    const resolvedCategoryIds = parseCategoryIds(rawCatIds, categoryId);
    if (resolvedCategoryIds.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one category is required' });
    }

    const slug  = await uniqueSlug(name);
    const image = req.file ? `uploads/profiles/${req.file.filename}` : null;

    const pooja = await Pooja.create({
      name,
      slug,
      categoryIds: resolvedCategoryIds,
      categoryId:  resolvedCategoryIds[0],
      description,
      shortDesc,
      price:         +price,
      mrp:           mrp       ? +mrp       : undefined,
      salePrice:     salePrice ? +salePrice : undefined,
      taxEnabled:    taxEnabled === 'true' || taxEnabled === true,
      taxRate:       taxRate   ? +taxRate   : 0,
      durationValue: durationValue ? +durationValue : undefined,
      durationUnit:  durationUnit  || undefined,
      image,
      requirements: requirements ? JSON.parse(requirements) : [],
      benefits:     benefits     ? JSON.parse(benefits)     : [],
      languages:    languages    ? JSON.parse(languages)    : [],
    });

    await auditLog(req, 'create_pooja', pooja);
    res.status(201).json({ success: true, pooja });
  } catch (err) { next(err); }
};

exports.updatePooja = async (req, res, next) => {
  try {
    const existing = await Pooja.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Pooja not found' });

    const updates = { ...req.body };
    if (req.file) updates.image = `uploads/profiles/${req.file.filename}`;

    // Regenerate slug only when the name actually changes
    if (updates.name && updates.name.trim() !== existing.name.trim()) {
      updates.slug = await uniqueSlug(updates.name.trim(), existing._id);
    } else {
      // Name unchanged — never touch slug
      delete updates.slug;
    }

    ['requirements', 'benefits', 'languages'].forEach((k) => {
      if (typeof updates[k] === 'string') {
        try { updates[k] = JSON.parse(updates[k]); } catch { updates[k] = []; }
      }
    });
    if (updates.durationValue !== undefined) updates.durationValue = +updates.durationValue || undefined;
    if (updates.price     !== undefined) updates.price     = +updates.price;
    if (updates.mrp       !== undefined) updates.mrp       = updates.mrp ? +updates.mrp : undefined;
    if (updates.salePrice !== undefined) updates.salePrice = updates.salePrice ? +updates.salePrice : undefined;
    if (updates.taxRate   !== undefined) updates.taxRate   = +updates.taxRate || 0;
    if (updates.taxEnabled !== undefined) updates.taxEnabled = updates.taxEnabled === 'true' || updates.taxEnabled === true;

    // Handle multi-category update (fix: do NOT delete categoryIds after setting)
    if (updates.categoryIds !== undefined || updates.categoryId !== undefined) {
      const resolvedIds = parseCategoryIds(updates.categoryIds, updates.categoryId);
      if (resolvedIds.length > 0) {
        updates.categoryIds = resolvedIds;
        updates.categoryId  = resolvedIds[0];
      } else {
        // Keep existing categories if nothing valid was provided
        delete updates.categoryIds;
        delete updates.categoryId;
      }
    }

    const pooja = await Pooja.findByIdAndUpdate(req.params.id, updates, { new: true });
    await auditLog(req, 'edit_pooja', pooja);
    res.json({ success: true, pooja });
  } catch (err) { next(err); }
};

exports.deletePooja = async (req, res, next) => {
  try {
    const pooja = await Pooja.findById(req.params.id);
    if (!pooja) return res.status(404).json({ success: false, message: 'Pooja not found' });

    const bookingCount = await Booking.countDocuments({ poojaId: req.params.id });
    if (bookingCount > 0) {
      return res.status(409).json({
        success: false,
        message: 'Bookings already exist for this pooja. Please deactivate instead.',
      });
    }

    await Pooja.findByIdAndUpdate(req.params.id, { isDeleted: true, deletedAt: new Date(), isActive: false });
    await auditLog(req, 'delete_pooja', pooja);
    res.json({ success: true, message: 'Pooja deleted' });
  } catch (err) { next(err); }
};

exports.togglePoojaStatus = async (req, res, next) => {
  try {
    const pooja = await Pooja.findById(req.params.id);
    if (!pooja) return res.status(404).json({ success: false, message: 'Pooja not found' });
    if (pooja.isDeleted) return res.status(400).json({ success: false, message: 'Cannot change status of a deleted pooja' });

    const newActive = !pooja.isActive;
    const updated   = await Pooja.findByIdAndUpdate(req.params.id, { isActive: newActive }, { new: true });
    await auditLog(req, newActive ? 'activate_pooja' : 'deactivate_pooja', pooja);
    res.json({ success: true, pooja: updated });
  } catch (err) { next(err); }
};
