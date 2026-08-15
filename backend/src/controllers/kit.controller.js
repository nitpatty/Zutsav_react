const Kit     = require('../models/Kit');
const Product = require('../models/Product');
const Pooja   = require('../models/Pooja');
const { roundToPaise } = require('../utils/financeUtils');
const translationService = require('../services/translationService');

const makeSlug = (name) => name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

// ── Kit display ordering ────────────────────────────────────────────────────
// The client's booking flow presents kits in a fixed logical tier order:
// Pooja Kit → Havan Kit → Vishesh Havan Kit. The stable source of truth is
// the admin-set `sortOrder` field on the Kit — kit names may change, the
// order must not. Kits created before that field existed have `sortOrder`
// null, so this inference maps their names to the same tier numbers purely
// as a backward-compatible fallback (never a substitute for sortOrder).
const KIT_TIER_INFERENCE = [
  { re: /vishesh/i, order: 3 },
  { re: /havan/i,   order: 2 },
  { re: /pooja|puja/i, order: 1 },
];
const LEGACY_KIT_TIER_ORDER = 4; // any legacy kit outside the known tiers

const inferKitOrder = (name = '') => {
  const match = KIT_TIER_INFERENCE.find(({ re }) => re.test(name));
  return match ? match.order : LEGACY_KIT_TIER_ORDER;
};

const effectiveKitOrder = (kit) =>
  (kit.sortOrder !== undefined && kit.sortOrder !== null) ? kit.sortOrder : inferKitOrder(kit.name);

const computeKitPricing = async (items, discountType, discountValue) => {
  let totalCost = 0;
  for (const item of items) {
    const product = await Product.findById(item.productId).select('price salePrice variants');
    if (product) {
      let unitPrice;
      if (item.variantId && product.variants?.length > 0) {
        const variant = product.variants.find((v) => v.variantId === item.variantId);
        unitPrice = variant ? variant.price : (product.salePrice || product.price);
      } else {
        unitPrice = product.salePrice || product.price;
      }
      totalCost += unitPrice * item.quantity;
    }
  }

  let computedSellingPrice = totalCost;
  if (discountType === 'percentage' && discountValue > 0) {
    computedSellingPrice = totalCost - (totalCost * discountValue) / 100;
  } else if (discountType === 'fixed' && discountValue > 0) {
    computedSellingPrice = totalCost - discountValue;
  }
  computedSellingPrice = Math.max(0, roundToPaise(computedSellingPrice));

  return { totalCost: roundToPaise(totalCost), computedSellingPrice };
};

// GET /api/marketplace/kits
exports.getKits = async (req, res, next) => {
  try {
    const { featured, page = 1, limit = 12 } = req.query;
    const query = { isActive: true };
    if (featured === 'true') query.isFeatured = true;

    let kits = await Kit.find(query)
      .populate({ path: 'items.productId', select: 'name price salePrice images stock isActive' })
      .populate('linkedPoojas', 'name slug')
      .sort({ isFeatured: -1, createdAt: -1 })
      .limit(+limit)
      .skip((+page - 1) * +limit)
      .lean();

    kits = await withKitTranslations(kits, req.query.lang);

    const total = await Kit.countDocuments(query);
    res.json({ success: true, kits, total, page: +page });
  } catch (err) { next(err); }
};

// GET /api/marketplace/kits/:id
exports.getKit = async (req, res, next) => {
  try {
    const kit = await Kit.findOne({ _id: req.params.id, isActive: true })
      .populate({ path: 'items.productId', select: 'name price salePrice images stock isActive' })
      .populate('linkedPoojas', 'name slug image')
      .lean();
    if (!kit) return res.status(404).json({ success: false, message: 'Kit not found' });

    const lang = (req.query.lang || 'en').toLowerCase();
    let responseKit = kit;
    if (lang !== 'en') {
      try {
        const { fields } = await translationService.getTranslation('kit', kit._id, lang);
        responseKit = { ...kit, ...fields, translationLanguage: lang };
      } catch (err) {
        console.error(`[Kit] translation lookup failed for ${kit._id}/${lang}:`, err.message);
      }
    }

    res.json({ success: true, kit: responseKit });
  } catch (err) { next(err); }
};

// GET /api/marketplace/kits/by-pooja/:poojaId  — public
exports.getKitsByPooja = async (req, res, next) => {
  try {
    let kits = await Kit.find({ isActive: true, linkedPoojas: req.params.poojaId })
      .populate({ path: 'items.productId', select: 'name price salePrice images stock isActive' })
      .lean();

    // Deterministic booking order — never price/name/creation-order based:
    //  1. explicit admin `sortOrder` (ascending)
    //  2. legacy fallback: tier inferred from the kit name (Pooja→1, Havan→2,
    //     Vishesh Havan→3, anything else→4)
    //  3. price as a stable tiebreak only
    kits.sort((a, b) =>
      (effectiveKitOrder(a) - effectiveKitOrder(b))
      || ((a.discountPrice || 0) - (b.discountPrice || 0))
    );

    kits = await withKitTranslations(kits, req.query.lang);

    res.json({ success: true, kits });
  } catch (err) { next(err); }
};

async function withKitTranslations(kits, langParam) {
  const lang = (langParam || 'en').toLowerCase();
  if (lang === 'en' || !kits.length) return kits;
  const map = await translationService.getTranslationsForDocs('kit', kits, lang);
  return kits.map((k) => (map[String(k._id)] ? { ...k, ...map[String(k._id)], translationLanguage: lang } : k));
}

// POST /api/marketplace/kits  [admin]
exports.createKit = async (req, res, next) => {
  try {
    const {
      name, description,
      discountType = 'percentage', discountValue = 0, discountPrice,
      items: rawItems, isFeatured, taxRate, sortOrder,
      linkedPoojas: rawLinkedPoojas,
    } = req.body;
    const items        = typeof rawItems        === 'string' ? JSON.parse(rawItems)        : rawItems;
    const linkedPoojas = rawLinkedPoojas
      ? (typeof rawLinkedPoojas === 'string' ? JSON.parse(rawLinkedPoojas) : rawLinkedPoojas)
      : [];

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || !product.isActive || product.isDeleted)
        return res.status(400).json({ success: false, message: `Product ${item.productId} not found or inactive` });

      if (item.variantId && product.variants?.length > 0) {
        const variant = product.variants.find((v) => v.variantId === item.variantId);
        if (!variant || variant.stock < 1)
          return res.status(400).json({ success: false, message: `Variant "${item.variantLabel || item.variantId}" of "${product.name}" is out of stock` });
      } else {
        if (product.stock < 1)
          return res.status(400).json({ success: false, message: `Product "${product.name}" is out of stock` });
      }
    }

    const { totalCost, computedSellingPrice } = await computeKitPricing(items, discountType, +discountValue);
    const sellingPrice = discountPrice !== undefined && discountPrice !== '' ? +discountPrice : computedSellingPrice;

    const baseSlug = makeSlug(name);
    let slug = baseSlug;
    let suffix = 1;
    while (await Kit.findOne({ slug })) { slug = `${baseSlug}-${suffix++}`; }

    const image = req.file ? `uploads/kits/${req.file.filename}` : null;

    const kit = await Kit.create({
      name, slug, description,
      items,
      totalCost,
      discountType,
      discountValue: +discountValue,
      discountPrice: sellingPrice,
      image,
      isFeatured:    isFeatured === 'true' || isFeatured === true,
      taxRate:       taxRate !== undefined ? +taxRate : 0,
      sortOrder:     sortOrder !== undefined && sortOrder !== '' ? +sortOrder : null,
      linkedPoojas,
    });
    res.status(201).json({ success: true, kit });
  } catch (err) { next(err); }
};

// PATCH /api/marketplace/kits/:id  [admin]
exports.updateKit = async (req, res, next) => {
  try {
    const updates = { ...req.body };
    if (req.file) updates.image = `uploads/kits/${req.file.filename}`;
    if (typeof updates.items        === 'string') updates.items        = JSON.parse(updates.items);
    if (typeof updates.linkedPoojas === 'string') updates.linkedPoojas = JSON.parse(updates.linkedPoojas);

    if (updates.items) {
      for (const item of updates.items) {
        const product = await Product.findById(item.productId);
        if (!product || !product.isActive || product.isDeleted)
          return res.status(400).json({ success: false, message: `Product ${item.productId} not found or inactive` });
        if (item.variantId && product.variants?.length > 0) {
          const variant = product.variants.find((v) => v.variantId === item.variantId);
          if (!variant) return res.status(400).json({ success: false, message: `Variant not found for "${product.name}"` });
        }
      }
      const { totalCost, computedSellingPrice } = await computeKitPricing(
        updates.items,
        updates.discountType || 'percentage',
        +(updates.discountValue || 0)
      );
      updates.totalCost = totalCost;
      if (updates.discountPrice === undefined || updates.discountPrice === '') {
        updates.discountPrice = computedSellingPrice;
      }
    }

    if (updates.discountValue !== undefined) updates.discountValue = +updates.discountValue;
    if (updates.discountPrice !== undefined) updates.discountPrice = +updates.discountPrice;
    if (updates.sortOrder !== undefined && updates.sortOrder !== '') updates.sortOrder = +updates.sortOrder;
    else if (updates.sortOrder !== undefined) updates.sortOrder = null;

    // Bump the translation version only when a translatable field actually
    // changed (see translationService.js) — pricing/item edits must not
    // invalidate cached translations.
    const existingKit = await Kit.findById(req.params.id).select('name description translationVersion').lean();
    if (existingKit) {
      const { fields: translatableFields } = require('../config/translatable.config').kit;
      const translatableChanged = Object.keys(translatableFields).some((key) => updates[key] !== undefined && updates[key] !== existingKit[key]);
      if (translatableChanged) updates.translationVersion = (existingKit.translationVersion || 1) + 1;
    }

    const kit = await Kit.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!kit) return res.status(404).json({ success: false, message: 'Kit not found' });
    res.json({ success: true, kit });
  } catch (err) { next(err); }
};

// DELETE /api/marketplace/kits/:id  [admin]
exports.deleteKit = async (req, res, next) => {
  try {
    await Kit.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Kit removed' });
  } catch (err) { next(err); }
};

// POST /api/marketplace/kits/compute-price  [admin helper]
exports.computePrice = async (req, res, next) => {
  try {
    const { items: rawItems, discountType = 'percentage', discountValue = 0 } = req.body;
    const items = typeof rawItems === 'string' ? JSON.parse(rawItems) : rawItems;
    if (!items?.length) return res.json({ success: true, totalCost: 0, computedSellingPrice: 0 });
    const result = await computeKitPricing(items, discountType, +discountValue);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};
