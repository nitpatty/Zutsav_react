/**
 * WhatsApp Cloud API webhook routes.
 *
 * No auth middleware — authenticity is provided by the Meta webhook
 * verification handshake (GET) and the X-Hub-Signature-256 header (POST),
 * both enforced inside the controller. Must be reachable by Meta's servers,
 * so it is deliberately public.
 */

const router = require('express').Router();
const ctrl = require('../controllers/whatsappWebhook.controller');

// Meta subscription verification handshake
router.get('/', ctrl.verifyWebhook);

// Meta webhook deliveries (messages / statuses / ...)
router.post('/', ctrl.receiveWebhook);

module.exports = router;
