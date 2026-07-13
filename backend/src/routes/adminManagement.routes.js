const router = require('express').Router();
const ctrl = require('../controllers/adminManagement.controller');
const { protect, authorize } = require('../middleware/auth');
const { uploadProfile } = require('../middleware/upload');

// Hard gate — a plain 'admin' never reaches any handler below. Mounted as its
// own top-level route (not nested under /api/admin) precisely so it does NOT
// inherit admin.routes.js's authorize('admin') blanket.
router.use(protect, authorize('system_admin'));

router.get('/dashboard', ctrl.getDashboardStats);

router.get('/admins',                            ctrl.listAdmins);
router.get('/admins/:id',                         ctrl.getAdminDetail);
router.post('/admins',    uploadProfile.single('profilePhoto'), ctrl.createAdmin);
router.patch('/admins/:id', uploadProfile.single('profilePhoto'), ctrl.updateAdmin);
router.patch('/admins/:id/suspend',               ctrl.suspendAdmin);
router.patch('/admins/:id/activate',              ctrl.activateAdmin);
router.post('/admins/:id/reset-password',         ctrl.resetAdminPassword);
router.delete('/admins/:id',                      ctrl.softDeleteAdmin);

router.get('/admins/:id/login-history',           ctrl.getLoginHistory);
router.get('/admins/:id/sessions',                ctrl.getAdminSessions);
router.post('/admins/:id/sessions/:sid/revoke',   ctrl.revokeSession);
router.post('/admins/:id/force-logout',           ctrl.forceLogoutAll);

router.get('/audit-logs',                         ctrl.listAuditLogs);
router.get('/audit-logs/:id',                     ctrl.getAuditLogDetail);

module.exports = router;
