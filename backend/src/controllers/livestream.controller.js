const Livestream = require('../models/Livestream');
const Temple     = require('../models/Temple');
const translationService = require('../services/translationService');

// GET /api/livestreams  — all authenticated users
exports.getLivestreams = async (req, res, next) => {
  try {
    const { templeId } = req.query;
    const query = { isActive: true };
    if (templeId) query.templeId = templeId;

    let streams = await Livestream.find(query)
      .populate('templeId', 'name city state')
      .sort({ createdAt: -1 })
      .lean();

    const lang = (req.query.lang || 'en').toLowerCase();
    if (lang !== 'en' && streams.length) {
      const map = await translationService.getTranslationsForDocs('livestream', streams, lang);
      streams = streams.map((s) => (map[String(s._id)] ? { ...s, ...map[String(s._id)], translationLanguage: lang } : s));
    }

    res.json({ success: true, livestreams: streams });
  } catch (err) {
    next(err);
  }
};

// POST /api/livestreams  [admin]
exports.createLivestream = async (req, res, next) => {
  try {
    const { templeId, title, description, youtubeUrl } = req.body;
    const temple = await Temple.findOne({ _id: templeId, isActive: true });
    if (!temple) return res.status(404).json({ success: false, message: 'Temple not found' });

    const stream = await Livestream.create({ templeId, title, description, youtubeUrl });
    res.status(201).json({ success: true, livestream: stream });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/livestreams/:id  [admin]
exports.updateLivestream = async (req, res, next) => {
  try {
    const existing = await Livestream.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Livestream not found' });

    const updates = { ...req.body };
    // Bump translation version when translatable fields change
    if ((updates.title !== undefined && updates.title !== existing.title) ||
        (updates.description !== undefined && updates.description !== existing.description)) {
      updates.translationVersion = (existing.translationVersion || 1) + 1;
    }

    const stream = await Livestream.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json({ success: true, livestream: stream });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/livestreams/:id  [admin]
exports.deleteLivestream = async (req, res, next) => {
  try {
    await Livestream.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Livestream removed' });
  } catch (err) {
    next(err);
  }
};
