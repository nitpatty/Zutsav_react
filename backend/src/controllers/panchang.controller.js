const panchangService = require('../services/panchangService');

const UNAVAILABLE = { success: false, message: 'Panchang temporarily unavailable' };

// GET /api/panchang?date=YYYY-MM-DD&lat=28.6&lon=77.2&tz=Asia/Kolkata
exports.getPanchang = async (req, res, next) => {
  try {
    const { date, lat, lon, tz } = req.query;
    if (date && Number.isNaN(new Date(date).getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date format. Use YYYY-MM-DD.' });
    }

    const panchang = await panchangService.getPanchang({
      date,
      lat: lat ? parseFloat(lat) : undefined,
      lon: lon ? parseFloat(lon) : undefined,
      timezone: tz || undefined,
    });
    res.json({ success: true, panchang });
  } catch (err) {
    if (err instanceof panchangService.PanchangUnavailableError) {
      return res.status(503).json(UNAVAILABLE);
    }
    next(err);
  }
};

// GET /api/panchang/week?date=YYYY-MM-DD&lat=28.6&lon=77.2&tz=Asia/Kolkata
exports.getWeekPanchang = async (req, res, next) => {
  try {
    const { date, lat, lon, tz } = req.query;
    if (date && Number.isNaN(new Date(date).getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date format. Use YYYY-MM-DD.' });
    }

    const panchang = await panchangService.getWeekPanchang({
      date,
      lat: lat ? parseFloat(lat) : undefined,
      lon: lon ? parseFloat(lon) : undefined,
      timezone: tz || undefined,
    });

    if (panchang.every((d) => d === null)) {
      return res.status(503).json(UNAVAILABLE);
    }
    res.json({ success: true, panchang });
  } catch (err) {
    if (err instanceof panchangService.PanchangUnavailableError) {
      return res.status(503).json(UNAVAILABLE);
    }
    next(err);
  }
};
