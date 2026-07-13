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

const auditCategoryLog = (req, action, target, note = '') =>
  AdminAuditLog.create({
    action,
    performedBy:     req.user._id,
    performedByName: req.user.name || req.user.email || 'Admin',
    targetId:        target._id,
    targetType:      'pooja_category',
    targetName:      target.name,
    note,
  }).catch(() => {});

const MAX_CATEGORY_NAME_LEN = 100;
const MAX_CATEGORY_DESC_LEN = 500;

function categoryPoojaQuery(categoryId) {
  return { isDeleted: { $ne: true }, $or: [{ categoryId }, { categoryIds: categoryId }] };
}

/** Case-insensitive duplicate check among non-deleted categories, excluding self on update. */
async function findDuplicateCategoryName(name, excludeId = null) {
  const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const query = { name: new RegExp(`^${escaped}$`, 'i'), isDeleted: { $ne: true } };
  if (excludeId) query._id = { $ne: excludeId };
  return PoojaCategory.findOne(query).select('_id').lean();
}

/** Slug uniqueness among non-deleted categories only — a deleted category's slug can be reused. */
async function uniqueCategorySlug(baseName, excludeId = null) {
  const base = makeBaseSlug(baseName);
  let slug    = base;
  let counter = 1;
  while (true) {
    const query = { slug, isDeleted: { $ne: true } };
    if (excludeId) query._id = { $ne: excludeId };
    const exists = await PoojaCategory.findOne(query).select('_id').lean();
    if (!exists) return slug;
    slug = `${base}-${counter++}`;
  }
}

// ── Categories ────────────────────────────────────────────────

// GET /api/poojas/categories — public, active-only (unchanged shape/behavior)
exports.getCategories = async (req, res, next) => {
  try {
    const categories = await PoojaCategory.find({ isActive: true, isDeleted: { $ne: true } }).sort({ sortOrder: 1 });
    res.json({ success: true, categories });
  } catch (err) { next(err); }
};

// GET /api/poojas/admin/categories — admin: all non-deleted categories (incl. inactive) + pooja counts
exports.getAdminCategories = async (req, res, next) => {
  try {
    const { search, status } = req.query;
    const query = { isDeleted: { $ne: true } };
    if (status === 'active')   query.isActive = true;
    if (status === 'inactive') query.isActive = false;
    if (search) {
      const rx = new RegExp(search.trim(), 'i');
      query.$or = [{ name: rx }, { description: rx }];
    }

    const cats = await PoojaCategory.find(query)
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name')
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();

    const categories = await Promise.all(cats.map(async (c) => {
      const poojaQuery = categoryPoojaQuery(c._id);
      const [total, active, featured] = await Promise.all([
        Pooja.countDocuments(poojaQuery),
        Pooja.countDocuments({ ...poojaQuery, isActive: true }),
        Pooja.countDocuments({ ...poojaQuery, isFeatured: true }),
      ]);
      return { ...c, poojaCount: total, activePoojaCount: active, inactivePoojaCount: total - active, featuredPoojaCount: featured };
    }));

    res.json({ success: true, categories });
  } catch (err) { next(err); }
};

// GET /api/poojas/admin/categories/:id — admin: single category + full detail counts
exports.getAdminCategoryDetail = async (req, res, next) => {
  try {
    const cat = await PoojaCategory.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name')
      .lean();
    if (!cat) return res.status(404).json({ success: false, message: 'Category not found' });

    const poojaQuery = categoryPoojaQuery(cat._id);
    const [total, active, featured] = await Promise.all([
      Pooja.countDocuments(poojaQuery),
      Pooja.countDocuments({ ...poojaQuery, isActive: true }),
      Pooja.countDocuments({ ...poojaQuery, isFeatured: true }),
    ]);

    res.json({
      success: true,
      category: { ...cat, poojaCount: total, activePoojaCount: active, inactivePoojaCount: total - active, featuredPoojaCount: featured },
    });
  } catch (err) { next(err); }
};

exports.createCategory = async (req, res, next) => {
  try {
    const { description, sortOrder, icon } = req.body;
    const name = (req.body.name || '').trim();

    if (!name) return res.status(400).json({ success: false, message: 'Category name is required' });
    if (name.length > MAX_CATEGORY_NAME_LEN) {
      return res.status(400).json({ success: false, message: `Category name cannot exceed ${MAX_CATEGORY_NAME_LEN} characters` });
    }
    if (description && description.length > MAX_CATEGORY_DESC_LEN) {
      return res.status(400).json({ success: false, message: `Description cannot exceed ${MAX_CATEGORY_DESC_LEN} characters` });
    }
    if (await findDuplicateCategoryName(name)) {
      return res.status(409).json({ success: false, message: `A category named "${name}" already exists` });
    }

    const slug  = await uniqueCategorySlug(name);
    const image = req.file ? `uploads/profiles/${req.file.filename}` : null;
    const cat   = await PoojaCategory.create({
      name, slug, description, image, sortOrder,
      icon: icon || undefined,
      createdBy: req.user._id,
    });

    await auditCategoryLog(req, 'create_category', cat);
    res.status(201).json({ success: true, category: cat });
  } catch (err) { next(err); }
};

exports.updateCategory = async (req, res, next) => {
  try {
    const existing = await PoojaCategory.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!existing) return res.status(404).json({ success: false, message: 'Category not found' });

    const allowed = ['name', 'description', 'icon', 'isActive', 'sortOrder'];
    const updates = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    if (req.file) updates.image = `uploads/profiles/${req.file.filename}`;

    if (updates.name !== undefined) {
      updates.name = updates.name.trim();
      if (!updates.name) return res.status(400).json({ success: false, message: 'Category name is required' });
      if (updates.name.length > MAX_CATEGORY_NAME_LEN) {
        return res.status(400).json({ success: false, message: `Category name cannot exceed ${MAX_CATEGORY_NAME_LEN} characters` });
      }
      if (updates.name.toLowerCase() !== existing.name.toLowerCase()) {
        if (await findDuplicateCategoryName(updates.name, existing._id)) {
          return res.status(409).json({ success: false, message: `A category named "${updates.name}" already exists` });
        }
        updates.slug = await uniqueCategorySlug(updates.name, existing._id);
      }
    }
    if (updates.description !== undefined && updates.description.length > MAX_CATEGORY_DESC_LEN) {
      return res.status(400).json({ success: false, message: `Description cannot exceed ${MAX_CATEGORY_DESC_LEN} characters` });
    }
    if (updates.isActive !== undefined) updates.isActive = updates.isActive === true || updates.isActive === 'true';
    if (updates.sortOrder !== undefined) updates.sortOrder = +updates.sortOrder || 0;
    updates.updatedBy = req.user._id;

    const cat = await PoojaCategory.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    await auditCategoryLog(req, 'edit_category', cat);
    res.json({ success: true, category: cat });
  } catch (err) { next(err); }
};

// DELETE /api/poojas/categories/:id
// No linked poojas -> deletes immediately. Linked poojas -> requires req.body.mode.
exports.deleteCategory = async (req, res, next) => {
  try {
    const cat = await PoojaCategory.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!cat) return res.status(404).json({ success: false, message: 'Category not found' });

    const poojaQuery = categoryPoojaQuery(cat._id);
    const linkedCount = await Pooja.countDocuments(poojaQuery);

    if (linkedCount === 0) {
      await PoojaCategory.findByIdAndUpdate(cat._id, { isDeleted: true, deletedAt: new Date(), isActive: false, updatedBy: req.user._id });
      await auditCategoryLog(req, 'delete_category', cat, 'No linked poojas');
      return res.json({ success: true, message: 'Category deleted' });
    }

    const { mode, targetCategoryId } = req.body;
    if (!['move', 'category-only', 'cascade'].includes(mode)) {
      return res.status(400).json({
        success: false,
        message: `This category has ${linkedCount} linked pooja(s). Choose how to proceed.`,
        linkedCount,
        requiresMode: true,
      });
    }

    if (mode === 'move') {
      if (!targetCategoryId) {
        return res.status(400).json({ success: false, message: 'targetCategoryId is required for mode "move"' });
      }
      if (String(targetCategoryId) === String(cat._id)) {
        return res.status(400).json({ success: false, message: 'Target category must be different from the category being deleted' });
      }
      const target = await PoojaCategory.findOne({ _id: targetCategoryId, isDeleted: { $ne: true } });
      if (!target) return res.status(400).json({ success: false, message: 'Target category not found' });

      const poojas = await Pooja.find(poojaQuery).select('_id categoryId categoryIds');
      await Promise.all(poojas.map((p) => {
        const nextIds = [...new Set(p.categoryIds.map(String).filter((id) => id !== String(cat._id)).concat(String(target._id)))];
        return Pooja.findByIdAndUpdate(p._id, { categoryId: target._id, categoryIds: nextIds });
      }));

      await PoojaCategory.findByIdAndUpdate(cat._id, { isDeleted: true, deletedAt: new Date(), isActive: false, updatedBy: req.user._id });
      await auditCategoryLog(req, 'delete_category', cat, `mode=move, movedCount=${poojas.length}, targetCategoryId=${target._id}`);
      return res.json({ success: true, message: 'Category deleted, poojas moved', movedCount: poojas.length });
    }

    if (mode === 'category-only') {
      const poojas = await Pooja.find(poojaQuery).select('_id categoryId categoryIds');
      await Promise.all(poojas.map((p) => {
        const nextIds = p.categoryIds.map(String).filter((id) => id !== String(cat._id));
        const nextCategoryId = String(p.categoryId) === String(cat._id) ? (nextIds[0] || null) : p.categoryId;
        return Pooja.findByIdAndUpdate(p._id, { categoryId: nextCategoryId, categoryIds: nextIds });
      }));

      await PoojaCategory.findByIdAndUpdate(cat._id, { isDeleted: true, deletedAt: new Date(), isActive: false, updatedBy: req.user._id });
      await auditCategoryLog(req, 'delete_category', cat, `mode=category-only, unlinkedCount=${poojas.length}`);
      return res.json({ success: true, message: 'Category deleted, poojas unlinked', unlinkedCount: poojas.length });
    }

    // mode === 'cascade'
    const poojas = await Pooja.find(poojaQuery).select('_id');
    const poojaIds = poojas.map((p) => p._id);
    const bookingCounts = await Booking.aggregate([
      { $match: { poojaId: { $in: poojaIds } } },
      { $group: { _id: '$poojaId', count: { $sum: 1 } } },
    ]);
    const bookedSet = new Set(bookingCounts.map((b) => String(b._id)));
    const toDelete   = poojaIds.filter((id) => !bookedSet.has(String(id)));
    const toDeactivate = poojaIds.filter((id) => bookedSet.has(String(id)));

    await Promise.all([
      toDelete.length && Pooja.updateMany({ _id: { $in: toDelete } }, { isDeleted: true, deletedAt: new Date(), isActive: false }),
      toDeactivate.length && Pooja.updateMany({ _id: { $in: toDeactivate } }, { isActive: false }),
    ]);

    await PoojaCategory.findByIdAndUpdate(cat._id, { isDeleted: true, deletedAt: new Date(), isActive: false, updatedBy: req.user._id });
    await auditCategoryLog(req, 'delete_category', cat, `mode=cascade, deleted=${toDelete.length}, deactivated=${toDeactivate.length}`);
    return res.json({
      success: true,
      message: 'Category and linked poojas deleted',
      deletedPoojas: toDelete.length,
      deactivatedPoojas: toDeactivate.length,
    });
  } catch (err) { next(err); }
};

// PATCH /api/poojas/admin/categories/:id/restore — backend-only for now, no UI yet
exports.restoreCategory = async (req, res, next) => {
  try {
    const cat = await PoojaCategory.findOne({ _id: req.params.id, isDeleted: true });
    if (!cat) return res.status(404).json({ success: false, message: 'Deleted category not found' });

    const updated = await PoojaCategory.findByIdAndUpdate(
      cat._id,
      { isDeleted: false, deletedAt: null, updatedBy: req.user._id },
      { new: true }
    );
    await auditCategoryLog(req, 'restore_category', cat);
    res.json({ success: true, category: updated });
  } catch (err) { next(err); }
};

// PATCH /api/poojas/admin/categories/:id/status — flip isActive only
exports.toggleCategoryStatus = async (req, res, next) => {
  try {
    const cat = await PoojaCategory.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!cat) return res.status(404).json({ success: false, message: 'Category not found' });

    const newActive = !cat.isActive;
    const updated = await PoojaCategory.findByIdAndUpdate(
      cat._id,
      { isActive: newActive, updatedBy: req.user._id },
      { new: true }
    );
    await auditCategoryLog(req, newActive ? 'activate_category' : 'deactivate_category', cat);
    res.json({ success: true, category: updated });
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
    const { categoryId, featured, page = 1, limit = 12, search, homepagePopular } = req.query;
    const query = { isActive: true, approvalStatus: 'approved', isDeleted: { $ne: true } };
    if (categoryId) {
      // Match poojas that have this category in either legacy or multi-category fields
      query.$or = [{ categoryId }, { categoryIds: categoryId }];
    }
    if (featured === 'true') query.isFeatured = true;
    if (search) query.name = new RegExp(search, 'i');

    if (homepagePopular === 'true') {
      const curated = await Pooja.find({ ...query, homepageRank: { $ne: null } })
        .populate('categoryIds', 'name slug')
        .populate('categoryId', 'name slug')
        .sort({ homepageRank: 1 })
        .limit(+limit);
      if (curated.length > 0) {
        return res.json({ success: true, poojas: curated, total: curated.length, page: 1, pages: 1 });
      }
      // No curated set — fall through to the standard featured/most-booked query below
    }

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

// GET /api/poojas/:slug/reviews?page=&limit= — public. Aggregates existing
// Booking.rating/review/ratingDate for this pooja; does not touch rateBooking
// or booking creation.
exports.getPoojaReviews = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const pooja = await Pooja.findOne({
      slug:           req.params.slug,
      isActive:       true,
      approvalStatus: 'approved',
      isDeleted:      { $ne: true },
    }).select('_id').lean();
    if (!pooja) return res.status(404).json({ success: false, message: 'Pooja not found' });

    const query = { poojaId: pooja._id, rating: { $ne: null } };
    const [reviews, total, agg] = await Promise.all([
      Booking.find(query)
        .select('rating review ratingDate userDetails.name')
        .sort({ ratingDate: -1 })
        .skip((+page - 1) * +limit)
        .limit(+limit)
        .lean(),
      Booking.countDocuments(query),
      Booking.aggregate([
        { $match: query },
        { $group: { _id: null, averageRating: { $avg: '$rating' }, totalReviews: { $sum: 1 } } },
      ]),
    ]);

    const summary = agg[0]
      ? { averageRating: Math.round(agg[0].averageRating * 10) / 10, totalReviews: agg[0].totalReviews }
      : { averageRating: 0, totalReviews: 0 };

    res.json({
      success: true,
      summary,
      reviews: reviews.map(r => ({
        rating:     r.rating,
        review:     r.review,
        ratingDate: r.ratingDate,
        userName:   r.userDetails?.name || 'Anonymous',
      })),
      page:  +page,
      pages: Math.ceil(total / limit),
      total,
    });
  } catch (err) { next(err); }
};

// ── Homepage "Popular Pujas" curation ───────────────────────────

// GET /api/poojas/homepage-popular — admin: current curated set
exports.getHomepagePopular = async (req, res, next) => {
  try {
    const poojas = await Pooja.find({ homepageRank: { $ne: null } })
      .populate('categoryIds', 'name')
      .populate('categoryId', 'name')
      .sort({ homepageRank: 1 });
    res.json({ success: true, poojas });
  } catch (err) { next(err); }
};

// PUT /api/poojas/homepage-popular — admin: replace curated set (max 8), order = array order
exports.setHomepagePopular = async (req, res, next) => {
  try {
    const { poojaIds } = req.body;
    if (!Array.isArray(poojaIds) || poojaIds.length > 8) {
      return res.status(400).json({ success: false, message: 'poojaIds must be an array of at most 8 pooja ids' });
    }

    await Pooja.updateMany({ homepageRank: { $ne: null } }, { homepageRank: null });
    await Promise.all(poojaIds.map((id, index) =>
      Pooja.findByIdAndUpdate(id, { homepageRank: index + 1 })
    ));

    const poojas = await Pooja.find({ homepageRank: { $ne: null } })
      .populate('categoryIds', 'name')
      .populate('categoryId', 'name')
      .sort({ homepageRank: 1 });
    res.json({ success: true, poojas });
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
