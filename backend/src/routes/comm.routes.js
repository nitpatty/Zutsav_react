const router = require('express').Router();
const ctrl   = require('../controllers/comm.controller');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('admin'));

// WhatsApp Templates — real Meta Cloud API sync, the source of truth for
// which approved templates exist. Everything else that used to live here
// (email templates, trigger rules, notification logs, test send) has been
// superseded by the unified Notification Engine admin screen — see
// /api/admin/notifications/* in admin.routes.js.
router.get  ('/wa-templates',          ctrl.listWhatsAppTemplates);
router.get  ('/wa-templates/enabled',  ctrl.listEnabledTemplates);   // enabled + approved only
router.post ('/wa-templates/sync',     ctrl.syncWhatsAppTemplates);
router.patch('/wa-templates/:id',      ctrl.updateWhatsAppTemplate);

module.exports = router;
