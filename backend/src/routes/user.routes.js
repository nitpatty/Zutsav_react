const router = require('express').Router();
const { getProfile, updateProfile, uploadPhoto, removePhoto, changePassword, getAddresses, addAddress, deleteAddress } = require('../controllers/user.controller');
const { protect } = require('../middleware/auth');
const { uploadProfile } = require('../middleware/upload');

router.use(protect);

router.get('/profile',             getProfile);
router.patch('/profile',           updateProfile);
router.post('/profile/photo',      uploadProfile.single('photo'), uploadPhoto);
router.delete('/profile/photo',    removePhoto);
router.patch('/change-password',   changePassword);
router.get('/addresses',           getAddresses);
router.post('/addresses',          addAddress);
router.delete('/addresses/:addrId', deleteAddress);

module.exports = router;
