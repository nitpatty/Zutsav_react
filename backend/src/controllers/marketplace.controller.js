const Product      = require('../models/Product');
const Kit          = require('../models/Kit');
const Order        = require('../models/Order');
const { audit } = require('../services/auditService');
const { createPhonePeOrder, checkPhonePeStatus, verifyWebhookChecksum } = require('../utils/phonepe');
const { NotificationEngine } = require('../../notification-engine');
const { normalizeOrderPayload } = require('../../notification-engine/variables/PayloadNormalizer');
const { deductStock } = require('../utils/inventoryUtils');
const { urls } = require('../config');
const translationService = require('../services/translationService');
const { sanitizeHtml } = require('../utils/sanitizeHtml');
const couponService = require('../services/couponService');

// ── SKU helpers ──────────────────────────────────────────────
function generateSku(name) {
  const namePart = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6).padEnd(3, 'X');
  const rand     = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PRD-${namePart}-${rand}`;
}

function generateVariantId(sku, quantity) {
  const qPart = quantity.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 8);
  return `${sku}-${qPart}`;
}

async function getUniqueSku(name) {
  let sku;
  let tries = 0;
  do {
    sku = generateSku(name);
    tries++;
  } while (await Product.findOne({ sku }) && tries < 10);
  return sku;
}

// ── Slug helpers ─────────────────────────────────────────────
function baseSlug(name) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

async function getUniqueSlug(name, excludeId = null) {
  const base = baseSlug(name);
  let slug = base;
  let counter = 1;
  while (true) {
    const query = { slug };
    if (excludeId) query._id = { $ne: excludeId };
    const exists = await Product.findOne(query).lean();
    if (!exists) return slug;
    slug = `${base}-${counter++}`;
  }
}

// ─── Public: GET /api/marketplace/products ────────────────────
exports.getProducts = async (req, res, next) => {
  try {
    const { category, featured, page = 1, limit = 12, search, sort } = req.query;
    const query = {
      isActive:       true,
      isDeleted:      { $ne: true },
      visibilityType: { $ne: 'kit_only' },
    };
    if (category) query.category = category;
    if (featured === 'true') query.isFeatured = true;
    if (search) query.name = new RegExp(search, 'i');

    const sortMap = {
      price_asc:  { price: 1 },
      price_desc: { price: -1 },
      name_asc:   { name: 1 },
    };
    const sortOrder = sortMap[sort] || { isFeatured: -1, createdAt: -1 };

    let products = await Product.find(query)
      .sort(sortOrder)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const lang = (req.query.lang || 'en').toLowerCase();
    if (lang !== 'en' && products.length) {
      const map = await translationService.getTranslationsForDocs('product', products, lang);
      products = products.map((p) => (map[String(p._id)] ? { ...p, ...map[String(p._id)], translationLanguage: lang } : p));
    }

    const total = await Product.countDocuments(query);
    res.json({ success: true, products, total });
  } catch (err) {
    next(err);
  }
};

// ─── Public: GET /api/marketplace/products/:slug ──────────────
exports.getProductBySlug = async (req, res, next) => {
  try {
    const product = await Product.findOne({
      slug:           req.params.slug,
      isActive:       true,
      isDeleted:      { $ne: true },
      visibilityType: { $ne: 'kit_only' },
    }).lean();
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const lang = (req.query.lang || 'en').toLowerCase();
    let responseProduct = product;
    if (lang !== 'en') {
      try {
        const { fields } = await translationService.getTranslation('product', product._id, lang);
        responseProduct = { ...product, ...fields, translationLanguage: lang };
      } catch (err) {
        console.error(`[Product] translation lookup failed for ${product._id}/${lang}:`, err.message);
      }
    }

    res.json({ success: true, product: responseProduct });
  } catch (err) {
    next(err);
  }
};

// ─── Admin: GET /api/marketplace/admin/products ───────────────
exports.getAdminProducts = async (req, res, next) => {
  try {
    const { search, category, status, includeDeleted } = req.query;
    const query = {};

    if (includeDeleted !== 'true') query.isDeleted = { $ne: true };
    if (category) query.category = category;
    if (status === 'active')   { query.isActive = true;  query.isDeleted = { $ne: true }; }
    if (status === 'inactive') { query.isActive = false; query.isDeleted = { $ne: true }; }
    if (status === 'deleted')  { query.isDeleted = true; }
    if (search) query.name = new RegExp(search, 'i');

    const raw = await Product.find(query).sort({ createdAt: -1 }).limit(200).lean();

    // Attach totalStock: sum of active-variant stocks for variant products,
    // or the flat stock field for non-variant products.
    const products = raw.map((p) => {
      const activeVariants = (p.variants || []).filter((v) => v.isActive !== false);
      const totalStock = activeVariants.length > 0
        ? activeVariants.reduce((sum, v) => sum + (v.stock || 0), 0)
        : (p.stock || 0);
      return { ...p, totalStock };
    });

    res.json({ success: true, products });
  } catch (err) {
    next(err);
  }
};

// ─── Admin: POST /api/marketplace/products ───────────────────
exports.createProduct = async (req, res, next) => {
  try {
    const { name, category, description, price, salePrice, stock, tags, visibilityType, taxRate, isActive, variants: rawVariants } = req.body;

    const slug   = await getUniqueSlug(name);
    const images = req.files ? req.files.map((f) => `uploads/products/${f.filename}`) : [];
    const sku    = await getUniqueSku(name);

    // Parse and stamp variants with auto-generated IDs
    let variants = [];
    if (rawVariants) {
      const parsed = typeof rawVariants === 'string' ? JSON.parse(rawVariants) : rawVariants;
      variants = parsed
        .filter((v) => v.quantity && v.price !== '' && v.price !== undefined)
        .map((v) => ({
          variantId: generateVariantId(sku, String(v.quantity)),
          quantity:  String(v.quantity),
          sku:       v.sku || null,
          price:     +v.price,
          salePrice: v.salePrice ? +v.salePrice : null,
          stock:     +v.stock || 0,
          isActive:  v.isActive !== false,
        }));
    }

    // Rich-text (TipTap) descriptions are stored as HTML and rendered as such
    // on the website/mobile — sanitize at write time exactly like pooja/blog
    // content so no raw <script>/event-handler markup ever reaches readers.
    const product = await Product.create({
      name, slug, sku, category, description: sanitizeHtml(description || ''),
      price:          variants.length ? 0 : (+price || 0),
      salePrice:      variants.length ? null : (salePrice ? +salePrice : null),
      stock:          variants.length ? 0 : (+stock || 0),
      variants,
      images,
      tags:           tags ? JSON.parse(tags) : [],
      visibilityType: visibilityType || 'marketplace',
      taxRate:        taxRate !== undefined ? +taxRate : 0,
      isActive:       isActive !== undefined ? (isActive === 'true' || isActive === true) : true,
    });
    audit(req, {
      module: 'marketplace', action: 'create_product',
      targetType: 'product', targetId: product._id, targetName: product.name,
      newValues: { price: product.price, salePrice: product.salePrice, stock: product.stock, category: product.category },
    }).catch(() => {});
    res.status(201).json({ success: true, product });
  } catch (err) {
    next(err);
  }
};

// ─── Admin: PATCH /api/marketplace/products/:id ──────────────
exports.updateProduct = async (req, res, next) => {
  try {
    const updates = { ...req.body };
    if (req.files?.length) updates.images = req.files.map((f) => `uploads/products/${f.filename}`);
    if (typeof updates.tags === 'string') updates.tags = JSON.parse(updates.tags);
    if (updates.price     !== undefined) updates.price     = +updates.price;
    if (updates.salePrice !== undefined) updates.salePrice = updates.salePrice ? +updates.salePrice : null;
    if (updates.stock     !== undefined) updates.stock     = +updates.stock;
    // Re-generate slug when name changes, ensuring it stays unique
    if (updates.name) updates.slug = await getUniqueSlug(updates.name, req.params.id);

    // Parse and re-stamp variants (preserve existing variantIds where quantity matches)
    if (updates.variants !== undefined) {
      const parsed = typeof updates.variants === 'string' ? JSON.parse(updates.variants) : updates.variants;
      const existing = await Product.findById(req.params.id).select('sku variants').lean();
      const sku = existing?.sku || (await getUniqueSku(updates.name || 'PROD'));

      updates.variants = parsed
        .filter((v) => v.quantity && v.price !== '' && v.price !== undefined)
        .map((v) => {
          const prev = existing?.variants?.find((ev) => ev.quantity === String(v.quantity));
          return {
            variantId: prev?.variantId || generateVariantId(sku, String(v.quantity)),
            quantity:  String(v.quantity),
            sku:       v.sku || prev?.sku || null,
            price:     +v.price,
            salePrice: v.salePrice ? +v.salePrice : null,
            stock:     +v.stock || 0,
            isActive:  v.isActive !== false,
          };
        });
    }

    const before = await Product.findById(req.params.id).select('name price salePrice stock isActive description tags translationVersion').lean();
    if (!before) return res.status(404).json({ success: false, message: 'Product not found' });

    if (updates.description !== undefined) updates.description = sanitizeHtml(updates.description || '');

    // Bump the translation version only when a translatable field actually
    // changed (see translationService.js) — price/stock-only edits must not
    // invalidate cached translations.
    const { fields: translatableFields } = require('../config/translatable.config').product;
    const translatableChanged = Object.keys(translatableFields).some((key) => {
      if (updates[key] === undefined) return false;
      if (translatableFields[key].type === 'string[]') return JSON.stringify(updates[key]) !== JSON.stringify(before[key]);
      return updates[key] !== before[key];
    });
    if (translatableChanged) updates.translationVersion = (before.translationVersion || 1) + 1;

    const product = await Product.findByIdAndUpdate(req.params.id, updates, { new: true });
    audit(req, {
      module: 'marketplace', action: 'edit_product',
      targetType: 'product', targetId: product._id, targetName: product.name,
      oldValues: { price: before.price, salePrice: before.salePrice, stock: before.stock },
      newValues: { price: product.price, salePrice: product.salePrice, stock: product.stock },
    }).catch(() => {});
    res.json({ success: true, product });
  } catch (err) {
    next(err);
  }
};

// ─── Admin: DELETE /api/marketplace/products/:id ─────────────
exports.deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const kitCount = await Kit.countDocuments({ 'items.productId': req.params.id, isActive: true });
    if (kitCount > 0) {
      return res.status(409).json({
        success: false,
        message: 'This product is currently used in one or more kits. Remove it from kits before deleting.',
      });
    }

    await Product.findByIdAndUpdate(req.params.id, { isDeleted: true, deletedAt: new Date(), isActive: false });
    audit(req, {
      module: 'marketplace', action: 'delete_product', severity: 'critical',
      targetType: 'product', targetId: product._id, targetName: product.name,
      oldValues: { isDeleted: false }, newValues: { isDeleted: true },
    }).catch(() => {});
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    next(err);
  }
};

// ─── Admin: PATCH /api/marketplace/products/:id/status ───────
exports.toggleProductStatus = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    if (product.isDeleted) return res.status(400).json({ success: false, message: 'Cannot change status of a deleted product' });

    const newActive = !product.isActive;
    const updated   = await Product.findByIdAndUpdate(req.params.id, { isActive: newActive }, { new: true });
    audit(req, {
      module: 'marketplace', action: newActive ? 'activate_product' : 'deactivate_product',
      targetType: 'product', targetId: product._id, targetName: product.name,
      oldValues: { isActive: product.isActive }, newValues: { isActive: newActive },
    }).catch(() => {});
    res.json({ success: true, product: updated });
  } catch (err) {
    next(err);
  }
};

// ─── User: POST /api/marketplace/orders/create ───────────────
exports.createOrder = async (req, res, next) => {
  try {
    const { items, shippingAddress, couponCode } = req.body;

    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || !product.isActive || product.isDeleted)
        return res.status(400).json({ success: false, message: `Product not available: ${item.productId}` });
      if (product.visibilityType === 'kit_only')
        return res.status(400).json({ success: false, message: `"${product.name}" cannot be purchased individually` });

      let price, variantId = null, variantLabel = null;

      if (item.variantId && product.variants?.length > 0) {
        // Variant product
        const variant = product.variants.find((v) => v.variantId === item.variantId);
        if (!variant)
          return res.status(400).json({ success: false, message: `Variant not found for ${product.name}` });
        if (variant.stock < item.quantity)
          return res.status(400).json({ success: false, message: `Only ${variant.stock} unit${variant.stock !== 1 ? 's' : ''} of ${product.name} (${variant.quantity}) in stock` });
        price        = variant.price;
        variantId    = variant.variantId;
        variantLabel = variant.quantity;
      } else {
        // Legacy flat product
        if (product.stock < item.quantity)
          return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name}` });
        price = product.salePrice || product.price;
      }

      totalAmount += price * item.quantity;
      orderItems.push({
        productId:    product._id,
        name:         product.name,
        variantId,
        variantLabel,
        price,
        quantity:     item.quantity,
        total:        price * item.quantity,
      });
    }

    // ── Coupon validation (server-authoritative) ──────────────
    let couponDiscount = 0;
    let resolvedCoupon = null;
    if (couponCode && typeof couponCode === 'string' && couponCode.trim()) {
      const coupon = await couponService.getCouponByCode(couponCode);
      if (!coupon) {
        return res.status(400).json({ success: false, message: 'Invalid coupon code' });
      }
      // Determine cart type: prefer PRODUCTS, fall back to MARKETPLACE
      const cartType = coupon.applicability.includes('PRODUCTS')
        ? 'PRODUCTS'
        : (coupon.applicability.includes('MARKETPLACE') ? 'MARKETPLACE' : null);
      if (!cartType) {
        return res.status(400).json({ success: false, message: 'This coupon is not applicable to product orders' });
      }

      const couponResult = await couponService.validateCoupon({
        code: couponCode,
        userId: req.user._id,
        cartValue: totalAmount,
        cartType,
      });
      if (!couponResult.valid) {
        return res.status(400).json({ success: false, message: couponResult.error });
      }
      couponDiscount = couponResult.discount;
      resolvedCoupon = couponResult.coupon;
      totalAmount = Math.max(0, Math.round((totalAmount - couponDiscount) * 100) / 100);
    }

    const merchantTransactionId = `ZOM_${Date.now()}_${req.user._id.toString().slice(-6)}`;
    const baseUrl = urls.clientUrl;

    const order = await Order.create({
      userId: req.user._id,
      items:  orderItems,
      totalAmount,
      shippingAddress,
      phonePeMerchantTransactionId: merchantTransactionId,
      paymentProvider:  'phonepe',
      status:           'pending_payment',
      statusTimeline:   [{ status: 'pending_payment', timestamp: new Date() }],
      couponCode:       resolvedCoupon ? resolvedCoupon.code : null,
      couponId:         resolvedCoupon ? resolvedCoupon._id : null,
      couponDiscount,
    });

    // Record coupon redemption
    if (resolvedCoupon && couponDiscount > 0) {
      await couponService.recordRedemption({
        couponId: resolvedCoupon._id,
        userId: req.user._id,
        orderId: order._id,
        purchaseType: resolvedCoupon.applicability.includes('PRODUCTS') ? 'PRODUCTS' : 'MARKETPLACE',
        discountType: resolvedCoupon.discountType,
        discountApplied: couponDiscount,
        cartValue: order.totalAmount + couponDiscount,
        finalPayable: order.totalAmount,
      }).catch(() => {});
    }

    const { redirectUrl } = await createPhonePeOrder({
      merchantTransactionId,
      amount:      totalAmount,
      userId:      req.user._id.toString(),
      callbackUrl: `${urls.serverUrl}/api/marketplace/orders/phonepe-webhook`,
      redirectUrl: `${baseUrl}/payment-callback/${merchantTransactionId}`,
    });

    NotificationEngine.emit(
      'ORDER_PLACED',
      normalizeOrderPayload({ order, user: req.user })
    ).catch(() => {});
    res.status(201).json({ success: true, order, redirectUrl, couponDiscount: couponDiscount || undefined });
  } catch (err) {
    next(err);
  }
};

// ─── User: GET /api/marketplace/orders/verify-phonepe/:id ────
exports.verifyPhonePeOrder = async (req, res, next) => {
  try {
    const { merchantTransactionId } = req.params;
    const result = await checkPhonePeStatus(merchantTransactionId);

    const order = await Order.findOne({ phonePeMerchantTransactionId: merchantTransactionId });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (result.success && order.status === 'pending_payment') {
      order.status = 'paid';
      order.phonePeTransactionId = result.transactionId;
      order.statusTimeline = order.statusTimeline || [];
      order.statusTimeline.push({ status: 'paid', timestamp: new Date(), note: 'Payment confirmed via PhonePe' });
      await order.save();
      await deductStock(order.items, order._id);
    }

    res.json({ success: result.success, state: result.state, order: result.success ? order : undefined });
  } catch (err) {
    next(err);
  }
};

// ─── Webhook: POST /api/marketplace/orders/phonepe-webhook ───
exports.phonePeWebhook = async (req, res, next) => {
  try {
    const { response } = req.body;
    const xVerify = req.headers['x-verify'];
    if (!await verifyWebhookChecksum(response, xVerify))
      return res.status(400).json({ success: false, message: 'Invalid checksum' });

    const decoded   = JSON.parse(Buffer.from(response, 'base64').toString());
    const txId      = decoded?.data?.merchantTransactionId;
    if (!txId) return res.status(400).json({ success: false });

    const isSuccess = decoded?.code === 'PAYMENT_SUCCESS';
    if (isSuccess) {
      const order = await Order.findOne({ phonePeMerchantTransactionId: txId, status: 'pending_payment' });
      if (order) {
        order.status = 'paid';
        order.phonePeTransactionId = decoded?.data?.transactionId;
        order.statusTimeline = order.statusTimeline || [];
        order.statusTimeline.push({ status: 'paid', timestamp: new Date(), note: 'Payment confirmed via PhonePe webhook' });
        await order.save();
        await deductStock(order.items, order._id);
      }
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ─── Legacy: POST /api/marketplace/orders/verify ─────────────
exports.verifyOrder = async (req, res) => {
  res.status(410).json({ success: false, message: 'Razorpay payments are no longer supported. Use PhonePe.' });
};

// ─── User: GET /api/marketplace/orders/my ────────────────────
exports.getMyOrders = async (req, res, next) => {
  try {
    const Shipment = require('../models/Shipment');
    const orders = await Order.find({ userId: req.user._id }).sort({ createdAt: -1 });
    const orderIds = orders.map((o) => o._id);
    const shipments = await Shipment.find({ orderId: { $in: orderIds } }).lean();
    const shipmentMap = {};
    shipments.forEach((s) => { shipmentMap[String(s.orderId)] = s; });
    const ordersWithShipment = orders.map((o) => ({
      ...o.toObject(),
      shipment: shipmentMap[String(o._id)] || null,
    }));
    res.json({ success: true, orders: ordersWithShipment });
  } catch (err) {
    next(err);
  }
};

// ─── User: GET /api/marketplace/orders/by-number/:orderNumber ──
exports.getOrderByNumber = async (req, res, next) => {
  try {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber, userId: req.user._id }).select('_id');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, orderId: order._id });
  } catch (err) {
    next(err);
  }
};

// ─── User: GET /api/marketplace/orders/:id ────────────────────
exports.getOrderById = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, userId: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const Shipment = require('../models/Shipment');
    const shipment = await Shipment.findOne({ orderId: order._id }).lean();

    res.json({ success: true, order: { ...order.toObject(), shipment: shipment || null } });
  } catch (err) {
    next(err);
  }
};

// ─── User: GET /api/marketplace/orders/:id/invoice ────────────
exports.getOrderInvoice = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, userId: req.user._id })
      .populate('userId', 'name email phone');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (!['paid', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered'].includes(order.status)) {
      return res.status(400).json({ success: false, message: 'Invoice is only available for paid orders.' });
    }

    const Shipment = require('../models/Shipment');
    const shipment = await Shipment.findOne({ orderId: order._id }).lean();

    res.json({ success: true, order: order.toObject(), shipment: shipment || null });
  } catch (err) {
    next(err);
  }
};
