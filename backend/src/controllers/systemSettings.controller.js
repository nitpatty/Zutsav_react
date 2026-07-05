const SystemSettings  = require('../models/SystemSettings');
const settingsService = require('../utils/settingsService');
const { sendTestConnectionEmail } = require('../utils/email');

const SENSITIVE = [
  'phonepeSaltKey',
  'whatsappAccessToken',
  'emailSmtpPassword',
  'groqApiKey',
  'cloudinaryApiSecret',
  'tekipostApiKey',
];

const MASK = '••••••••';

exports.getSettings = async (req, res) => {
  try {
    let doc = await SystemSettings.findOne().lean();
    if (!doc) doc = {};
    SENSITIVE.forEach((f) => { if (doc[f]) doc[f] = MASK; });
    res.json({ success: true, settings: doc });
  } catch (err) {
    console.error('getSettings error:', err);
    res.status(500).json({ success: false, message: 'Failed to load settings' });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const update = { ...req.body };
    if (req.file) update.logo = `uploads/logos/${req.file.filename}`;

    SENSITIVE.forEach((f) => { if (update[f] === MASK || update[f] === '') delete update[f]; });

    // Coerce numeric fields
    ['emailSmtpPort', 'platformCommissionPercent', 'platformCommissionFixed', 'platformGstPercent',
     'partialPaymentMinAmount',
    ].forEach((f) => {
      if (update[f] !== undefined) update[f] = Number(update[f]);
    });

    // Coerce boolean fields
    if (update.partialPaymentEnabled !== undefined)
      update.partialPaymentEnabled = update.partialPaymentEnabled === true || update.partialPaymentEnabled === 'true';

    // Coerce array of numbers
    if (update.partialPaymentOptions !== undefined) {
      if (!Array.isArray(update.partialPaymentOptions))
        update.partialPaymentOptions = String(update.partialPaymentOptions).split(',').map(Number).filter(n => !isNaN(n) && n > 0);
      else
        update.partialPaymentOptions = update.partialPaymentOptions.map(Number).filter(n => !isNaN(n) && n > 0);
      // Never persist an empty array — keep schema default
      if (update.partialPaymentOptions.length === 0) delete update.partialPaymentOptions;
    }

    // Sanitize enum fields — remove them rather than persisting an invalid value
    if (update.partialPaymentMode !== undefined && !['percentage', 'fixed'].includes(String(update.partialPaymentMode)))
      delete update.partialPaymentMode;
    if (update.platformCommissionType !== undefined && !['percent', 'fixed'].includes(String(update.platformCommissionType)))
      delete update.platformCommissionType;

    // Sanitize NaN numerics — remove rather than fail runValidators
    ['emailSmtpPort','platformCommissionPercent','platformCommissionFixed','platformGstPercent','partialPaymentMinAmount',
     'sessionTimeoutMinutes','otpExpiryMinutes','passwordMinLength'].forEach((f) => {
      if (update[f] !== undefined && isNaN(update[f])) delete update[f];
    });

    delete update._id;
    delete update.__v;
    delete update.createdAt;
    delete update.updatedAt;

    const doc = await SystemSettings.findOneAndUpdate(
      {},
      { $set: update },
      { new: true, upsert: true, runValidators: true }
    );

    settingsService.invalidate();
    res.json({ success: true, message: 'Settings saved successfully', logo: doc.logo });
  } catch (err) {
    console.error('updateSettings error:', err);
    res.status(500).json({ success: false, message: 'Failed to save settings' });
  }
};

// POST /api/admin/settings/test-email — send a test email to verify SMTP config
exports.testEmailConnection = async (req, res) => {
  try {
    const { testEmail } = req.body;
    const to = testEmail || req.user?.email;
    if (!to) return res.status(400).json({ success: false, message: 'testEmail is required' });

    await sendTestConnectionEmail(to);
    res.json({ success: true, message: `Test email sent to ${to}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
