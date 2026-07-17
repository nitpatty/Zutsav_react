const axios  = require('axios');
const Temple = require('../models/Temple');
const { audit } = require('../services/auditService');

const STATUS_VALUES = ['draft', 'published', 'hidden', 'archived'];

const geocode = async (address, city, state) => {
  try {
    const q = encodeURIComponent(`${address}, ${city}, ${state}, India`);
    const { data } = await axios.get(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      { headers: { 'User-Agent': 'Zutsav/1.0 (zutsav@example.com)' }, timeout: 5000 }
    );
    if (data.length > 0) return { latitude: +data[0].lat, longitude: +data[0].lon };
  } catch (_) { /* geocoding is best-effort */ }
  return {};
};

// GET /api/temples  — public
exports.getTemples = async (req, res, next) => {
  try {
    const { search, state, page = 1, limit = 20, homepageFeatured } = req.query;
    const query = { isActive: true, isDeleted: { $ne: true } };
    if (state)  query.state  = new RegExp(state, 'i');
    if (search) query.name   = new RegExp(search, 'i');

    if (homepageFeatured === 'true') {
      const curated = await Temple.find({ ...query, isFeatured: true, homepageRank: { $ne: null } })
        .sort({ homepageRank: 1 })
        .limit(+limit);
      if (curated.length > 0) {
        return res.json({ success: true, temples: curated, total: curated.length, page: 1 });
      }
      // No curated set — fall back to latest temples
      const latest = await Temple.find(query).sort({ createdAt: -1 }).limit(+limit);
      return res.json({ success: true, temples: latest, total: latest.length, page: 1 });
    }

    const temples = await Temple.find(query)
      .sort({ name: 1 })
      .limit(+limit)
      .skip((+page - 1) * +limit);

    const total = await Temple.countDocuments(query);
    res.json({ success: true, temples, total, page: +page });
  } catch (err) {
    next(err);
  }
};

// GET /api/temples/admin — admin: full list with search/filter/sort/pagination
exports.getAdminTemples = async (req, res, next) => {
  try {
    const {
      search, state, city, category, status, featured,
      sort = 'newest', page = 1, limit = 12,
    } = req.query;

    const query = {};
    if (status === 'deleted') {
      query.isDeleted = true;
    } else {
      query.isDeleted = { $ne: true };
      if (status && STATUS_VALUES.includes(status)) query.status = status;
    }
    if (state)    query.state    = new RegExp(`^${state}$`, 'i');
    if (city)     query.city     = new RegExp(`^${city}$`, 'i');
    if (category) query.category = new RegExp(`^${category}$`, 'i');
    if (featured === 'true')  query.isFeatured = true;
    if (featured === 'false') query.isFeatured = false;
    if (search) {
      const re = new RegExp(search, 'i');
      query.$or = [{ name: re }, { city: re }, { state: re }, { primaryDeity: re }];
    }

    const sortMap = {
      name:    { name: 1 },
      newest:  { createdAt: -1 },
      oldest:  { createdAt: 1 },
      updated: { updatedAt: -1 },
    };
    const sortBy = sortMap[sort] || sortMap.newest;

    const total = await Temple.countDocuments(query);
    const temples = await Temple.find(query)
      .sort(sortBy)
      .skip((+page - 1) * +limit)
      .limit(+limit);

    res.json({ success: true, temples, total, page: +page });
  } catch (err) { next(err); }
};

// GET /api/temples/homepage-featured — admin: current curated set
exports.getHomepageFeatured = async (req, res, next) => {
  try {
    const temples = await Temple.find({ isFeatured: true, homepageRank: { $ne: null } }).sort({ homepageRank: 1 });
    res.json({ success: true, temples });
  } catch (err) { next(err); }
};

// PUT /api/temples/homepage-featured — admin: replace curated set (max 8), order = array order
exports.setHomepageFeatured = async (req, res, next) => {
  try {
    const { templeIds } = req.body;
    if (!Array.isArray(templeIds) || templeIds.length > 8) {
      return res.status(400).json({ success: false, message: 'templeIds must be an array of at most 8 temple ids' });
    }

    await Temple.updateMany({ isFeatured: true }, { isFeatured: false, homepageRank: null });
    await Promise.all(templeIds.map((id, index) =>
      Temple.findByIdAndUpdate(id, { isFeatured: true, homepageRank: index + 1 })
    ));

    const temples = await Temple.find({ isFeatured: true, homepageRank: { $ne: null } }).sort({ homepageRank: 1 });
    res.json({ success: true, temples });
  } catch (err) { next(err); }
};

// GET /api/temples/:id  — public
exports.getTemple = async (req, res, next) => {
  try {
    const temple = await Temple.findOne({ _id: req.params.id, isActive: true, isDeleted: { $ne: true } });
    if (!temple) return res.status(404).json({ success: false, message: 'Temple not found' });
    res.json({ success: true, temple });
  } catch (err) {
    next(err);
  }
};

// POST /api/temples  [admin]
exports.createTemple = async (req, res, next) => {
  try {
    const {
      name, address, city, state, pincode, description, latitude, longitude,
      category, primaryDeity, openingHours,
    } = req.body;
    let status = STATUS_VALUES.includes(req.body.status) ? req.body.status : 'published';

    const images = req.files?.images ? req.files.images.map((f) => `uploads/temples/${f.filename}`) : [];
    const coverImage = req.files?.coverImage?.[0] ? `uploads/temples/${req.files.coverImage[0].filename}` : '';

    // Use provided coords from map picker, fall back to geocoding from address
    let coords = {};
    if (latitude && longitude) {
      coords = { latitude: +latitude, longitude: +longitude };
    } else {
      coords = await geocode(address, city, state);
    }

    const temple = await Temple.create({
      name, address, city, state, pincode, description,
      category, primaryDeity, openingHours, coverImage,
      images,
      latitude:  coords.latitude,
      longitude: coords.longitude,
      status,
      isActive: status === 'published',
    });

    audit(req, {
      module: 'temple', action: 'create_temple',
      targetType: 'temple', targetId: temple._id, targetName: temple.name,
      newValues: { status: temple.status, city: temple.city, state: temple.state },
    }).catch(() => {});

    res.status(201).json({ success: true, temple });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/temples/:id  [admin]
exports.updateTemple = async (req, res, next) => {
  try {
    const before = await Temple.findById(req.params.id);
    if (!before) return res.status(404).json({ success: false, message: 'Temple not found' });

    const updates = { ...req.body };

    // Gallery: keep the admin-chosen order of already-saved images, append newly-uploaded ones.
    if (updates.existingImages !== undefined) {
      try {
        updates.images = JSON.parse(updates.existingImages);
      } catch (_) { updates.images = before.images; }
      delete updates.existingImages;
    }
    if (req.files?.images?.length) {
      updates.images = [...(updates.images || before.images || []), ...req.files.images.map((f) => `uploads/temples/${f.filename}`)];
    }
    if (req.files?.coverImage?.[0]) {
      updates.coverImage = `uploads/temples/${req.files.coverImage[0].filename}`;
    }

    if (updates.status && !STATUS_VALUES.includes(updates.status)) delete updates.status;
    if (updates.status) updates.isActive = updates.status === 'published';

    // Re-geocode if address fields changed
    if (updates.address || updates.city || updates.state) {
      const coords = await geocode(
        updates.address  || before.address,
        updates.city     || before.city,
        updates.state    || before.state
      );
      if (coords.latitude) { updates.latitude = coords.latitude; updates.longitude = coords.longitude; }
    }

    const temple = await Temple.findByIdAndUpdate(req.params.id, updates, { new: true });

    audit(req, {
      module: 'temple', action: 'edit_temple',
      targetType: 'temple', targetId: temple._id, targetName: temple.name,
      oldValues: { status: before.status, name: before.name },
      newValues: { status: temple.status, name: temple.name },
    }).catch(() => {});

    res.json({ success: true, temple });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/temples/:id/status  [admin]
exports.toggleTempleStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!STATUS_VALUES.includes(status)) {
      return res.status(400).json({ success: false, message: `status must be one of: ${STATUS_VALUES.join(', ')}` });
    }
    const temple = await Temple.findById(req.params.id);
    if (!temple) return res.status(404).json({ success: false, message: 'Temple not found' });
    if (temple.isDeleted) return res.status(400).json({ success: false, message: 'Cannot change status of a deleted temple' });

    const before = temple.status;
    temple.status = status;
    temple.isActive = status === 'published';
    await temple.save();

    audit(req, {
      module: 'temple', action: 'change_temple_status',
      targetType: 'temple', targetId: temple._id, targetName: temple.name,
      oldValues: { status: before }, newValues: { status },
    }).catch(() => {});

    res.json({ success: true, temple });
  } catch (err) { next(err); }
};

// POST /api/temples/:id/duplicate  [admin]
exports.duplicateTemple = async (req, res, next) => {
  try {
    const original = await Temple.findById(req.params.id).lean();
    if (!original) return res.status(404).json({ success: false, message: 'Temple not found' });

    const { _id, createdAt, updatedAt, __v, ...rest } = original;
    const copy = await Temple.create({
      ...rest,
      name: `${original.name} (Copy)`,
      status: 'draft',
      isActive: false,
      isFeatured: false,
      homepageRank: null,
    });

    audit(req, {
      module: 'temple', action: 'duplicate_temple',
      targetType: 'temple', targetId: copy._id, targetName: copy.name,
      newValues: { duplicatedFrom: original._id },
    }).catch(() => {});

    res.status(201).json({ success: true, temple: copy });
  } catch (err) { next(err); }
};

// DELETE /api/temples/:id  [admin]
exports.deleteTemple = async (req, res, next) => {
  try {
    const temple = await Temple.findById(req.params.id);
    if (!temple) return res.status(404).json({ success: false, message: 'Temple not found' });

    await Temple.findByIdAndUpdate(req.params.id, {
      isDeleted: true, deletedAt: new Date(), isActive: false, status: 'archived',
    });

    audit(req, {
      module: 'temple', action: 'delete_temple', severity: 'critical',
      targetType: 'temple', targetId: temple._id, targetName: temple.name,
      oldValues: { isDeleted: false }, newValues: { isDeleted: true },
    }).catch(() => {});

    res.json({ success: true, message: 'Temple removed' });
  } catch (err) {
    next(err);
  }
};
