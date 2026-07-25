const router      = require('express').Router();
const ctrl        = require('../controllers/admin.controller');
const poojaRequest = require('../controllers/poojaRequest.controller');
const settingsCtrl = require('../controllers/systemSettings.controller');
const invoiceCtrl  = require('../controllers/invoice.controller');
const logMgmt      = require('../controllers/logManagement.controller');
const configCenterRoutes = require('./configCenter.routes');
const { protect, authorize } = require('../middleware/auth');
const { uploadLogo } = require('../middleware/upload');

router.use(protect, authorize('admin'));

router.use('/config-center', configCenterRoutes);
router.use('/documents', require('./legalDocumentAdmin.routes'));

router.get('/dashboard',                    ctrl.getDashboard);
router.get('/activity-feed',               ctrl.getActivityFeed);

// Pandits
router.get('/pandits',                      ctrl.getPandits);
router.get('/pandits/available',            ctrl.getAvailablePandits);
router.get('/pandits/search',               ctrl.searchPandits);
router.get('/pandits/:id',                  ctrl.getPanditProfile);
router.patch('/pandits/:id/approve',        ctrl.approvePandit);
router.patch('/pandits/:id/kyc',            ctrl.updateKYCStatus);
router.get('/pandits/:id/kyc-document/:field', ctrl.getPanditKycDocument);
router.patch('/pandits/:id/pooja-price',    ctrl.setPoojaApprovedPrice);
router.delete('/pandits/:id',               ctrl.deletePandit);

// Pandit custom pooja request approval queue
router.get('/pooja-requests',                poojaRequest.adminListRequests);
router.patch('/pooja-requests/:id/approve',  poojaRequest.adminApproveRequest);
router.patch('/pooja-requests/:id/reject',   poojaRequest.adminRejectRequest);

// Users
router.get('/users',                        ctrl.getUsers);
router.patch('/users/:id/status',           ctrl.updateUserStatus);
router.patch('/users/:id/cancel-deletion',  ctrl.adminCancelDeletion);
router.delete('/users/:id',                 ctrl.adminDeleteUser);

// Bookings
router.get('/bookings',                          ctrl.getBookings);
router.get('/bookings/export',                   ctrl.exportBookings);
router.get('/bookings/:id',                      ctrl.getBookingById);
router.get('/bookings/:id/payments',             ctrl.getBookingPayments);
router.patch('/bookings/:id/assign',             ctrl.assignPandit);
router.patch('/bookings/:id/status',             ctrl.updateBookingStatus);
router.patch('/bookings/:id/approve-completion', ctrl.approveCompletion);
router.patch('/bookings/:id/reject-completion',  ctrl.rejectCompletion);
router.patch('/bookings/:id/kit-delivery',          ctrl.updateKitDelivery);
router.post('/bookings/:id/kit-delivery/tackipost', ctrl.createTackipostShipment);
router.patch('/bookings/:id/assign-payout',      ctrl.assignPayout);
router.patch('/bookings/:id/mark-payout-paid',   ctrl.markPayoutPaid);
router.patch('/bookings/:id/referral-status',    ctrl.updateReferralStatus);
router.get('/bookings/:id/refund-details',       ctrl.getRefundDetails);
router.patch('/bookings/:id/refund/process',     ctrl.processRefund);

// Referral Analytics
router.get('/referrals/analytics',               ctrl.getReferralAnalytics);

// Marketplace Orders
router.get('/orders',                           ctrl.getOrders);
router.get('/orders/:id',                       ctrl.getOrderById);
router.get('/orders/:id/invoice',               ctrl.getAdminOrderInvoice);
router.patch('/orders/:id/status',              ctrl.updateOrderStatus);
router.patch('/orders/:id/shipment',            ctrl.updateOrderShipment);           // legacy
// Shipment Management
router.get('/shipping-config',                              ctrl.getShippingConfig);
router.get('/orders/:id/shipment',                          ctrl.getOrderShipment);
// TekiPost Single Order API (2-step flow: init → confirm)
router.post('/orders/:id/shipment/tekipost/init',           ctrl.initTekipostOrder);
router.post('/orders/:id/shipment/tekipost/confirm',        ctrl.confirmTekipostOrder);
router.post('/orders/:id/shipment/tekipost/cancel-awb',     ctrl.cancelTekipostShipmentAWB);
router.patch('/orders/:id/shipment/tekipost/wallet-refund', ctrl.markWalletRefundCompleted);
router.post('/orders/:id/shipment/manual',                  ctrl.createManualOrderShipment);
router.patch('/orders/:id/shipment/status',                 ctrl.updateOrderShipmentStatus);
router.post('/orders/:id/shipment/sync',                    ctrl.syncTekipostOrderStatus);
// Delivery OTP
router.post('/orders/:id/delivery-otp/generate', ctrl.generateDeliveryOTP);
router.post('/orders/:id/delivery-otp/resend',   ctrl.resendDeliveryOTP);
router.post('/orders/:id/delivery-otp/verify',   ctrl.verifyDeliveryOTP);

// Education Masters
router.get('/education-masters',            ctrl.getEducationMasters);
router.post('/education-masters',           ctrl.createEducationMaster);
router.patch('/education-masters/:id',      ctrl.updateEducationMaster);
router.delete('/education-masters/:id',     ctrl.deleteEducationMaster);

// Specialization Masters
router.get('/specialization-masters',       ctrl.getSpecializationMasters);
router.post('/specialization-masters',      ctrl.createSpecializationMaster);
router.patch('/specialization-masters/:id', ctrl.updateSpecializationMaster);
router.delete('/specialization-masters/:id',ctrl.deleteSpecializationMaster);

// Payout Management
router.get('/payouts/pending',               ctrl.getPendingPayouts);
router.get('/payouts/history',               ctrl.getPayoutHistory);
router.post('/payouts/pay-batch/:panditId',  ctrl.payBatch);
router.post('/payouts/pay-single/:bookingId',ctrl.paySingle);

// System Settings
router.get('/settings',            settingsCtrl.getSettings);
router.patch('/settings',          uploadLogo.single('logo'), settingsCtrl.updateSettings);
router.post('/settings/test-email', settingsCtrl.testEmailConnection);

// Blog Administration
router.get('/blogs',                    ctrl.adminGetBlogs);
router.patch('/blogs/:id/approve',      ctrl.adminApproveBlog);
router.patch('/blogs/:id/reject',       ctrl.adminRejectBlog);
router.patch('/blogs/:id/feature',      ctrl.adminFeatureBlog);
router.patch('/blogs/:id/archive',      ctrl.adminArchiveBlog);
router.delete('/blogs/:id',             ctrl.adminDeleteBlog);

// Communication Center — Broadcast
router.post('/broadcast',               ctrl.sendBroadcast);

// Global Search
router.get('/search',                   ctrl.globalSearch);

// System Health
router.get('/system-health',            ctrl.getSystemHealth);

// Blog Categories
router.get('/blog-categories',          ctrl.getBlogCategories);
router.post('/blog-categories',         ctrl.createBlogCategory);
router.patch('/blog-categories/:id',    ctrl.updateBlogCategory);
router.delete('/blog-categories/:id',   ctrl.deleteBlogCategory);

// Blog Permissions
router.get('/blog-permissions',         ctrl.getBlogPermissions);
router.patch('/blog-permissions',       ctrl.updateBlogPermissions);

// Invoice Management — /export and static paths MUST precede /:id
router.get('/invoices/export',          invoiceCtrl.exportInvoices);
router.get('/invoices',                 invoiceCtrl.adminGetInvoices);
router.patch('/invoices/:id/cancel',    invoiceCtrl.adminCancelInvoice);
router.patch('/invoices/:id/archive',   invoiceCtrl.adminArchiveInvoice);

// ── Notification Engine Management ────────────────────────────────────────────
// Events registry (read-only)
router.get('/notifications/events',                       ctrl.getNotificationEvents);
// WhatsApp templates dropdown (Meta-synced)
router.get('/notifications/whatsapp-templates',           ctrl.getWhatsAppTemplatesForMapping);
// Notification mappings — static paths MUST precede /:id
router.get('/notifications/mappings/export',               ctrl.exportNotificationMappings);
router.post('/notifications/mappings/import',              ctrl.importNotificationMappings);
router.post('/notifications/mappings/bulk',                ctrl.bulkNotificationMappings);
router.get('/notifications/mappings',                      ctrl.getNotificationMappings);
router.post('/notifications/mappings',                     ctrl.createNotificationMapping);
router.post('/notifications/mappings/:id/clone',           ctrl.cloneNotificationMapping);
router.post('/notifications/mappings/:id/test',            ctrl.testNotificationMapping);
router.get('/notifications/mappings/:id/history',           ctrl.getNotificationMappingHistory);
router.post('/notifications/mappings/:id/history/:versionId/restore', ctrl.restoreNotificationMappingVersion);
router.patch('/notifications/mappings/:id',                ctrl.updateNotificationMapping);
router.patch('/notifications/mappings/:id/toggle',         ctrl.toggleNotificationMapping);
router.delete('/notifications/mappings/:id',                ctrl.deleteNotificationMapping);
// Test send (legacy body-based form, kept for compatibility)
router.post('/notifications/test',                         ctrl.testNotificationMapping);
// Notification logs
router.get('/notifications/logs',                          ctrl.getNotificationLogs);
router.post('/notifications/logs/:id/retry',                ctrl.retryNotificationLog);

// ── Log Management ────────────────────────────────────────────────────────────
// Static routes MUST precede /:type to avoid param collisions
router.get('/logs/overview',        logMgmt.getOverview);
router.get('/logs/cleanup-history', logMgmt.getCleanupHistory);
router.get('/logs/retention',       logMgmt.getRetentionSettings);
router.patch('/logs/retention',     logMgmt.updateRetentionSettings);
router.get('/logs/:type/preview',   logMgmt.previewCleanup);
router.get('/logs/:type/export',    logMgmt.exportLogs);
router.post('/logs/:type/cleanup',  logMgmt.performCleanup);

module.exports = router;
