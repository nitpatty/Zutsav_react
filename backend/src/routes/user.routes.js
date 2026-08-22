const router = require('express').Router();
const {
  getProfile, updateProfile, uploadPhoto, removePhoto, changePassword,
  getAddresses, addAddress, updateAddress, deleteAddress,
  getFamilyMembers, addFamilyMember, updateFamilyMember, deleteFamilyMember,
  getWhatsAppConsent, updateWhatsAppConsent,
} = require('../controllers/user.controller');
const { protect } = require('../middleware/auth');
const { uploadProfile } = require('../middleware/upload');

router.use(protect);

router.get('/profile',             getProfile);
router.patch('/profile',           updateProfile);
router.post('/profile/photo',      uploadProfile.single('photo'), uploadPhoto);
router.delete('/profile/photo',    removePhoto);
router.patch('/change-password',   changePassword);

// WhatsApp communication preferences (My Profile preference center)
router.get('/consent/whatsapp',   getWhatsAppConsent);
router.patch('/consent/whatsapp', updateWhatsAppConsent);
router.get('/addresses',           getAddresses);
router.post('/addresses',          addAddress);
router.patch('/addresses/:addrId', updateAddress);
router.delete('/addresses/:addrId', deleteAddress);

// Family members
router.get('/family-members',              getFamilyMembers);
router.post('/family-members',             addFamilyMember);
router.patch('/family-members/:memberId',  updateFamilyMember);
router.delete('/family-members/:memberId', deleteFamilyMember);

module.exports = router;
