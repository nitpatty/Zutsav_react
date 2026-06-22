const router = require('express').Router();
const SystemSettings = require('../models/SystemSettings');

// GET /api/settings/public — no auth required
// Returns only the branding/contact fields safe for public consumption.
router.get('/public', async (req, res) => {
  try {
    const s = await SystemSettings.findOne()
      .select('platformName logo contactEmail supportPhone supportAddress')
      .lean() || {};
    res.json({
      success: true,
      settings: {
        platformName:   s.platformName   || 'Zutsav',
        logo:           s.logo           || '',
        contactEmail:   s.contactEmail   || '',
        supportPhone:   s.supportPhone   || '',
        supportAddress: s.supportAddress || '',
      },
    });
  } catch {
    res.json({
      success: true,
      settings: { platformName: 'Zutsav', logo: '', contactEmail: '', supportPhone: '', supportAddress: '' },
    });
  }
});

module.exports = router;
