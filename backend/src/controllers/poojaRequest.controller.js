const PoojaRequest = require('../models/PoojaRequest');
const Pandit       = require('../models/Pandit');
const Pooja        = require('../models/Pooja');
const { audit }    = require('../services/auditService');
const { NotificationEngine } = require('../../notification-engine');
const { normalizePoojaRequestPayload } = require('../../notification-engine/variables/PayloadNormalizer');

const makeBaseSlug = (name) => name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

async function uniqueSlug(baseName) {
  const base = makeBaseSlug(baseName);
  let slug = base;
  let counter = 1;
  while (await Pooja.findOne({ slug }).select('_id').lean()) {
    slug = `${base}-${counter++}`;
  }
  return slug;
}

// A positive, finite, decimal-safe price. Rejects '', null, NaN, Infinity,
// negative and zero — never lets a bad value silently reach Mongoose's
// `min` validator, which passes NaN straight through.
function parsePositivePrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

// GET /api/pandit/pooja-requests
exports.getMyRequests = async (req, res, next) => {
  try {
    const pandit = await Pandit.findOne({ userId: req.user._id });
    if (!pandit) return res.status(404).json({ success: false, message: 'Pandit profile not found' });

    const requests = await PoojaRequest.find({ panditId: pandit._id })
      .populate('categoryId', 'name')
      .sort({ createdAt: -1 });

    res.json({ success: true, requests });
  } catch (err) { next(err); }
};

// POST /api/pandit/pooja-requests
exports.createRequest = async (req, res, next) => {
  try {
    const pandit = await Pandit.findOne({ userId: req.user._id });
    if (!pandit) return res.status(404).json({ success: false, message: 'Pandit profile not found' });
    if (pandit.status !== 'approved') {
      return res.status(403).json({ success: false, message: 'Only approved pandits can submit pooja requests' });
    }

    const {
      poojaName, categoryId, description, shortDesc,
      estimatedDuration, estimatedDurationUnit, expectedPrice,
      requirements, benefits, languages,
    } = req.body;

    if (!poojaName || !String(poojaName).trim()) {
      return res.status(400).json({ success: false, message: 'Pooja name is required' });
    }
    if (!categoryId) {
      return res.status(400).json({ success: false, message: 'Category is required' });
    }
    const price = parsePositivePrice(expectedPrice);
    if (price === null) {
      return res.status(400).json({ success: false, message: 'Expected Price must be a number greater than zero' });
    }
    const duration = Number(estimatedDuration);
    if (!Number.isFinite(duration) || duration < 1) {
      return res.status(400).json({ success: false, message: 'Estimated duration is required' });
    }
    if (!['hours', 'days'].includes(estimatedDurationUnit)) {
      return res.status(400).json({ success: false, message: 'Estimated duration unit must be hours or days' });
    }

    const parseListField = (v) => {
      if (!v) return [];
      if (Array.isArray(v)) return v;
      try { return JSON.parse(v); } catch { return String(v).split(',').map((s) => s.trim()).filter(Boolean); }
    };

    const request = await PoojaRequest.create({
      panditId:    pandit._id,
      poojaName:   String(poojaName).trim(),
      categoryId,
      description: description || '',
      shortDesc:   shortDesc || '',
      estimatedDuration:     duration,
      estimatedDurationUnit,
      expectedPrice: price,
      requirements: parseListField(requirements),
      benefits:     parseListField(benefits),
      languages:    parseListField(languages),
      image: req.file ? `uploads/profiles/${req.file.filename}` : null,
      status: 'pending',
    });

    await audit(req, {
      module: 'pandit_pooja_request',
      action: 'pooja_request_submitted',
      targetType: 'pooja_request',
      targetId: request._id,
      targetName: request.poojaName,
      newValues: { expectedPrice: price, status: 'pending' },
    });

    NotificationEngine.emit(
      'PANDIT_POOJA_REQUEST_CREATED',
      normalizePoojaRequestPayload({ request, pandit })
    ).catch(() => {});

    res.status(201).json({ success: true, request });
  } catch (err) { next(err); }
};

// GET /api/admin/pooja-requests?status=&search=&page=&limit=
exports.adminListRequests = async (req, res, next) => {
  try {
    const { status = 'pending', search = '', page = 1, limit = 20 } = req.query;
    const query = {};
    if (status && status !== 'all') query.status = status;

    let requests = await PoojaRequest.find(query)
      .populate('categoryId', 'name')
      .populate('panditId', 'name phone email')
      .sort({ createdAt: -1 })
      .lean();

    if (search && search.trim()) {
      const re = new RegExp(search.trim(), 'i');
      requests = requests.filter((r) => re.test(r.poojaName) || re.test(r.panditId?.name || ''));
    }

    const total = requests.length;
    const start = (+page - 1) * +limit;
    const paged = requests.slice(start, start + +limit);

    res.json({ success: true, requests: paged, total });
  } catch (err) { next(err); }
};

// PATCH /api/admin/pooja-requests/:id/approve
exports.adminApproveRequest = async (req, res, next) => {
  try {
    const approvedPrice = parsePositivePrice(req.body.approvedPrice);
    if (approvedPrice === null) {
      return res.status(400).json({ success: false, message: 'Approved Price must be a number greater than zero' });
    }

    // Atomic CAS: only a request that is still 'pending' can be approved.
    // A null result means it was already decided (double-click / race) —
    // return a clean error instead of silently re-approving.
    const request = await PoojaRequest.findOneAndUpdate(
      { _id: req.params.id, status: 'pending' },
      {
        status: 'approved',
        adminApprovedPrice: approvedPrice,
        reviewedBy: req.user._id,
        reviewedByName: req.user.name || 'Admin',
        reviewedAt: new Date(),
        adminNote: req.body.adminNote || '',
      },
      { new: true }
    ).populate('categoryId', 'name').populate('panditId', 'name phone email');

    if (!request) {
      return res.status(409).json({ success: false, message: 'Request not found or already reviewed' });
    }

    try {
      const slug = await uniqueSlug(request.poojaName);
      const pooja = await Pooja.create({
        name: request.poojaName,
        categoryId: request.categoryId,
        slug,
        description: request.description,
        shortDesc: request.shortDesc,
        price: approvedPrice,
        durationValue: request.estimatedDuration,
        durationUnit: request.estimatedDurationUnit,
        image: request.image,
        requirements: request.requirements,
        benefits: request.benefits,
        languages: request.languages,
        isActive: true,
        createdByRole: 'pandit',
        panditId: request.panditId._id,
        approvalStatus: 'approved',
      });

      request.poojaId = pooja._id;
      await request.save();

      await audit(req, {
        module: 'pandit_pooja_request',
        action: 'pooja_request_approved',
        targetType: 'pooja_request',
        targetId: request._id,
        targetName: request.poojaName,
        oldValues: { expectedPrice: request.expectedPrice },
        newValues: { adminApprovedPrice: approvedPrice, poojaId: pooja._id },
      });

      NotificationEngine.emit(
        'PANDIT_POOJA_APPROVED',
        normalizePoojaRequestPayload({ request, pandit: request.panditId })
      ).catch(() => {});

      res.json({ success: true, request, pooja });
    } catch (creationErr) {
      // Pooja creation failed validation (e.g. bad category ref) — revert
      // the request so it never sits in a false "approved" state.
      await PoojaRequest.updateOne(
        { _id: request._id, status: 'approved' },
        { status: 'pending', adminApprovedPrice: null, reviewedBy: null, reviewedByName: '', reviewedAt: null }
      );
      throw creationErr;
    }
  } catch (err) { next(err); }
};

// PATCH /api/admin/pooja-requests/:id/reject
exports.adminRejectRequest = async (req, res, next) => {
  try {
    const rejectionReason = (req.body.rejectionReason || '').trim();
    if (!rejectionReason) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required' });
    }

    const request = await PoojaRequest.findOneAndUpdate(
      { _id: req.params.id, status: 'pending' },
      {
        status: 'rejected',
        rejectionReason,
        reviewedBy: req.user._id,
        reviewedByName: req.user.name || 'Admin',
        reviewedAt: new Date(),
      },
      { new: true }
    ).populate('categoryId', 'name').populate('panditId', 'name phone email');

    if (!request) {
      return res.status(409).json({ success: false, message: 'Request not found or already reviewed' });
    }

    await audit(req, {
      module: 'pandit_pooja_request',
      action: 'pooja_request_rejected',
      targetType: 'pooja_request',
      targetId: request._id,
      targetName: request.poojaName,
      newValues: { status: 'rejected', rejectionReason },
    });

    NotificationEngine.emit(
      'PANDIT_POOJA_REJECTED',
      normalizePoojaRequestPayload({ request, pandit: request.panditId })
    ).catch(() => {});

    res.json({ success: true, request });
  } catch (err) { next(err); }
};
