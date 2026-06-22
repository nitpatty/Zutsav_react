const router   = require('express').Router();
const ctrl     = require('../controllers/marketplace.controller');
const kitCtrl  = require('../controllers/kit.controller');
const { protect, authorize } = require('../middleware/auth');
const { uploadProducts, uploadProfile } = require('../middleware/upload');

// ─── Products: Public ─────────────────────────────────────────
router.get('/products',         ctrl.getProducts);
router.get('/products/:slug',   ctrl.getProductBySlug);

// ─── Products: Admin ──────────────────────────────────────────
// admin-products must come before /products/:id to avoid slug collision
router.get('/admin/products',           protect, authorize('admin'), ctrl.getAdminProducts);
router.post('/products',                protect, authorize('admin'), uploadProducts.array('images', 5), ctrl.createProduct);
router.patch('/products/:id/status',    protect, authorize('admin'), ctrl.toggleProductStatus);
router.patch('/products/:id',           protect, authorize('admin'), uploadProducts.array('images', 5), ctrl.updateProduct);
router.delete('/products/:id',          protect, authorize('admin'), ctrl.deleteProduct);

// ─── Orders: User ─────────────────────────────────────────────
router.post('/orders/create',                                   protect, ctrl.createOrder);
router.get('/orders/verify-phonepe/:merchantTransactionId',     protect, ctrl.verifyPhonePeOrder);
router.get('/orders/my',                                        protect, ctrl.getMyOrders);
router.post('/orders/verify',                                   protect, ctrl.verifyOrder);       // legacy 410
router.post('/orders/phonepe-webhook',                          ctrl.phonePeWebhook);             // public webhook

// ─── Kits: Public ─────────────────────────────────────────────
router.get('/kits/by-pooja/:poojaId', kitCtrl.getKitsByPooja);
router.get('/kits',                   kitCtrl.getKits);
router.get('/kits/:id',               kitCtrl.getKit);

// ─── Kits: Admin ──────────────────────────────────────────────
router.post('/kits/compute-price',protect, authorize('admin'), kitCtrl.computePrice);
router.post('/kits',              protect, authorize('admin'), uploadProfile.single('image'), kitCtrl.createKit);
router.patch('/kits/:id',         protect, authorize('admin'), uploadProfile.single('image'), kitCtrl.updateKit);
router.delete('/kits/:id',        protect, authorize('admin'), kitCtrl.deleteKit);

module.exports = router;
