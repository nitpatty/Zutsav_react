const router = require('express').Router();
const ctrl   = require('../controllers/poojaRequest.controller');
const { protect, authorize } = require('../middleware/auth');
const { uploadProfile } = require('../middleware/upload');

// All routes require pandit login
router.use(protect, authorize('pandit'));

router.get('/',  ctrl.getMyRequests);
router.post('/', uploadProfile.single('image'), ctrl.createRequest);

module.exports = router;
