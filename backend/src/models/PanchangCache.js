const mongoose = require('mongoose');

// One document per (lat, lon, timezone, date) combination — the exact cache
// key panchangService.js builds. `expiresAt` carries a TTL index so Mongo
// reaps stale entries on its own; the service also checks it explicitly
// before serving a hit, so cache correctness never depends on Mongo's TTL
// sweep timing (which only guarantees eventual, not immediate, deletion).
const panchangCacheSchema = new mongoose.Schema({
  locationKey: { type: String, required: true }, // `${lat},${lon},${timezone},${date}`
  date:        { type: String, required: true }, // YYYY-MM-DD, local to `timezone`
  lat:         { type: Number, required: true },
  lon:         { type: Number, required: true },
  timezone:    { type: String, required: true },
  data:        { type: mongoose.Schema.Types.Mixed, required: true }, // normalized panchang object
  fetchedAt:   { type: Date, default: Date.now },
  expiresAt:   { type: Date, required: true },
}, { timestamps: true });

panchangCacheSchema.index({ locationKey: 1 }, { unique: true });
panchangCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PanchangCache', panchangCacheSchema);
