/**
 * Panchang service — FreeAstroAPI-backed, 24h cached, single source of truth
 * for Tithi/Nakshatra/Yoga/Karana/Sunrise/Sunset/Rahu Kaal and friends.
 *
 * Responsibilities live here (not in the controller or a component):
 *   - build the FreeAstroAPI request
 *   - authenticate (key lookup, same DB-override-then-env pattern as groq.js)
 *   - validate the raw response before trusting any of it
 *   - normalize into the flat shape the frontend/mobile already render
 *   - derive the handful of values that are safe to compute from the API's
 *     own accurate sunrise/sunset (Abhijit Muhurat, Brahma Muhurta) — see
 *     the "never fabricated" list below for what is deliberately NOT derived
 *   - cache per (lat, lon, timezone, date) for 24h so the ~80 req/day budget
 *     covers many users/locations, not one
 *
 * Tithi/Yoga/Karana: verified live against the real API (not assumed) —
 * tithi and yoga are normally single objects, karanas is routinely a
 * 2-element array (a karana is half a tithi). All three are handled
 * uniformly as "one or more entries" (see asItems/buildTimedEntries), so a
 * day with two tithis or two yogas is rendered in full, not truncated to
 * one — exposed as `tithiEntries`/`yogaEntries`/`karanaEntries`, each entry
 * carrying its own start/end time. `tithi`/`yoga`/`karana` (singular
 * strings) stay in the output unchanged, always the first entry's name, for
 * every existing reader (PanchangDashboard/PanchangScreen/UserDashboard)
 * that only ever needed one value.
 *
 * Fields FreeAstroAPI's /api/v2/vedic/panchang does not return, and that are
 * NOT derived locally because the weekday/nakshatra tables involved could
 * not be verified against an authoritative source: Yamaganda, Gulika Kaal,
 * Dur Muhurat, Varjyam, Amrit Kaal, Vijay Muhurat. Moonrise/Moonset need
 * real lunar-altitude ephemeris (the same class of problem this migration
 * exists to get away from). All are normalized to `null`/absent from
 * `auspiciousTimings`/`inauspiciousTimings` — never guessed — so a future
 * addition just flips one candidate's `value` and both the array and the UI
 * pick it up with no further changes (see the candidate lists in normalize()).
 */

const axios = require('axios');
const settings = require('../utils/settingsService');
const { freeastroapi } = require('../config/integrations.config');
const PanchangCache = require('../models/PanchangCache');

const PANCHANG_URL = freeastroapi.panchangUrl;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LAT = 28.6139;  // New Delhi — same default the old controller used
const DEFAULT_LON = 77.2090;
const DEFAULT_TZ = process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';

class PanchangUnavailableError extends Error {}

// ── Small date/timezone helpers (no date library in this project) ─────────

const pad2 = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' that `date` falls on on the wall clock in `timezone`. */
const dateStrInTimezone = (date, timezone) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${m.year}-${m.month}-${m.day}`;
};

/** 'YYYY-MM-DD' representing "today" in the given IANA timezone. */
const todayInTimezone = (timezone) => dateStrInTimezone(new Date(), timezone);

/** Add `days` (may be negative) to a 'YYYY-MM-DD' string, calendar-only. */
const shiftDateStr = (dateStr, days) => {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
};

/** Offset (minutes, east-positive) of `timeZone` from UTC at instant `date`. */
const tzOffsetMinutes = (timeZone, date) => {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asUTC - date.getTime()) / 60000;
};

/**
 * Resolve a local wall-clock time string from the API (e.g. "06:02" or a
 * full ISO datetime) plus the request date into a real UTC Date, honoring
 * the requested timezone. Uses a single-pass offset approximation (correct
 * everywhere except inside a DST transition hour, which Asia/Kolkata and
 * most Panchang-relevant Indian timezones don't have) — adequate for
 * deriving Abhijit/Brahma Muhurta, not used for any core Panchang value.
 */
const parseApiLocalTime = (dateStr, timeStr, timezone) => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  if (timeStr.includes('T')) {
    const d = new Date(timeStr);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const bits = timeStr.split(':').map((x) => parseInt(x, 10));
  const [h, min = 0, sec = 0] = bits;
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  const [y, mo, d] = dateStr.split('-').map(Number);
  const naiveUTC = Date.UTC(y, mo - 1, d, h, min, sec);
  const offset = tzOffsetMinutes(timezone, new Date(naiveUTC));
  return new Date(naiveUTC - offset * 60000);
};

const fmtTime = (d) => (d ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A');

const buildLocationKey = (lat, lon, timezone, dateStr) => {
  const r4 = (n) => Math.round(n * 10000) / 10000;
  return `${r4(lat)},${r4(lon)},${timezone},${dateStr}`;
};

/**
 * Turns a chronological list of {name, ends_at_iso} items — what the API
 * gives us for tithi/yoga/karanas, whether it returns one of them or several
 * (verified live: karanas is routinely 2 entries per day since a karana is
 * half a tithi; tithi/yoga are normally 1 but a short "kshaya" tithi/yoga
 * could plausibly produce 2) — into display-ready {name, start, end}
 * entries, with each entry's start exactly where the previous one ended.
 *
 * The day's first entry is shown starting at sunrise — the traditional
 * Panchang-day boundary (its true astronomical start may be earlier, even
 * the previous calendar day); every printed Panchang uses this convention.
 * `ends_at_iso` is a full ISO instant, so end times need no timezone
 * approximation, unlike the bare "HH:MM" strings sunrise/sunset/rahu_kalam
 * arrive as. An entry whose end falls on a later calendar date than
 * `dateStr` is labeled "Next Day" instead of a clock time.
 */
const buildTimedEntries = (items, { dateStr, timezone, sunriseDate }) => {
  const entries = [];
  let cursor = sunriseDate;
  for (const item of items) {
    if (!item?.name) continue;
    const endDate = item.ends_at_iso ? new Date(item.ends_at_iso) : null;
    const endValid = endDate && !Number.isNaN(endDate.getTime());
    const crossesToNextDay = endValid && dateStrInTimezone(endDate, timezone) !== dateStr;
    entries.push({
      name: item.name,
      start: cursor ? fmtTime(cursor) : 'N/A',
      end: !endValid ? 'N/A' : crossesToNextDay ? 'Next Day' : fmtTime(endDate),
    });
    if (endValid) cursor = endDate;
  }
  return entries;
};

// ── Moon phase — categorical label from tithi index, same buckets the old
//    hand-rolled engine used, now keyed off the API's exact tithi number
//    instead of a locally-computed elongation angle. ────────────────────
const deriveMoonPhase = (tithiNumber, paksha) => {
  if (typeof tithiNumber !== 'number') return null;
  const combined0 = paksha === 'Krishna' ? 14 + tithiNumber : tithiNumber - 1; // 0..29
  const deg = ((combined0 * 12) % 360 + 360) % 360;
  if (deg < 12) return 'New Moon';
  if (deg < 90) return 'Waxing Crescent';
  if (deg < 102) return 'First Quarter';
  if (deg < 168) return 'Waxing Gibbous';
  if (deg < 192) return 'Full Moon';
  if (deg < 270) return 'Waning Gibbous';
  if (deg < 282) return 'Last Quarter';
  if (deg < 348) return 'Waning Crescent';
  return 'New Moon';
};

// ── Request building ────────────────────────────────────────────────────

const buildRequestBody = ({ year, month, day, lat, lon, timezone }) => ({
  year, month, day,
  hour: 6, minute: 0, // sunrise-anchored daily reading, same convention the old controller used
  lat, lng: lon,
  tz_str: timezone,
  ayanamsha: 'lahiri', // pinned explicitly so results don't drift if the vendor's default ever changes
});

// ── Low-level API call — key lookup, auth header, error classification,
//    mirrors utils/groq.js's `_callGroq` shape so ops can read logs the
//    same way for every third-party integration in this codebase. ───────
const callFreeAstroApi = async (body) => {
  const apiKey = await settings.get('freeAstroApiKey', process.env.FREEASTRO_API_KEY);
  if (!apiKey) {
    console.error('[FreeAstroAPI] ❌ FREEASTRO_API_KEY is not set — add it to .env or Admin › System Settings');
    throw new PanchangUnavailableError('FREEASTRO_API_KEY is not configured');
  }

  try {
    const { data } = await axios.post(PANCHANG_URL, body, {
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    return data;
  } catch (err) {
    if (err.response) {
      const { status, data, headers } = err.response;
      if (status === 429) {
        console.error(`[FreeAstroAPI] ❌ 429 rate limited. Retry-After: ${headers?.['retry-after']}. Body:`, JSON.stringify(data));
      } else {
        console.error(`[FreeAstroAPI] ❌ HTTP ${status}.`, 'Body:', JSON.stringify(data), '| Key prefix:', apiKey.slice(0, 8) + '…');
      }
    } else if (err.code === 'ECONNABORTED') {
      console.error('[FreeAstroAPI] ❌ Request timed out (>15s).');
    } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      console.error('[FreeAstroAPI] ❌ Network error — cannot reach api.freeastroapi.com:', err.code);
    } else {
      console.error('[FreeAstroAPI] ❌ Unexpected error:', err.message);
    }
    throw new PanchangUnavailableError('FreeAstroAPI request failed');
  }
};

/** Normalizes a field the API may return as either one object or an array of them. */
const asItems = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

// ── Response validation — reject anything with missing/null/wrong-typed
//    required fields before it ever reaches the cache or the UI. ─────────
const validateResponse = (raw) => {
  const fail = (msg) => { throw new PanchangUnavailableError(`Invalid Panchang response: ${msg}`); };
  if (!raw || typeof raw !== 'object') fail('empty body');
  if (typeof raw.date !== 'string' || !raw.date) fail('missing date');
  if (typeof raw.sunrise !== 'string' || !raw.sunrise) fail('missing sunrise');
  if (typeof raw.sunset !== 'string' || !raw.sunset) fail('missing sunset');
  if (typeof raw.weekday?.name !== 'string' || !raw.weekday.name) fail('missing weekday.name');

  // tithi/yoga/karanas: documented (and verified live) as tithi/yoga being a
  // single object and karanas an array, but validated uniformly as "one or
  // more items" so neither shape is ever assumed — a future response with
  // multiple tithi/yoga entries (or a single-object karanas) is accepted
  // exactly the same way, never silently truncated to one entry.
  const tithiItems = asItems(raw.tithi);
  const yogaItems = asItems(raw.yoga);
  const karanaItems = asItems(raw.karanas);
  if (!tithiItems.length || !tithiItems.every((t) => typeof t?.name === 'string' && t.name && typeof t?.paksha === 'string' && t.paksha && typeof t?.number === 'number')) {
    fail('missing/invalid tithi entry (name/paksha/number)');
  }
  if (!yogaItems.length || !yogaItems.every((y) => typeof y?.name === 'string' && y.name)) fail('missing/invalid yoga entry');
  if (!karanaItems.length || !karanaItems.every((k) => typeof k?.name === 'string' && k.name)) fail('missing/invalid karana entry');

  if (typeof raw.nakshatra?.name !== 'string' || !raw.nakshatra.name) fail('missing nakshatra.name');
  if (typeof raw.rahu_kalam?.start !== 'string' || typeof raw.rahu_kalam?.end !== 'string') fail('missing rahu_kalam start/end');
};

// ── Normalize → the exact flat shape PanchangPage/PanchangDashboard/
//    PanchangScreen/UserDashboard already render, plus additive new fields
//    kept null unless safely derivable (see module doc comment). ─────────
const normalize = (raw, { lat, lon, timezone, dateStr }) => {
  const sunriseDate = parseApiLocalTime(dateStr, raw.sunrise, timezone);
  const sunsetDate = parseApiLocalTime(dateStr, raw.sunset, timezone);
  const rahuStartDate = parseApiLocalTime(dateStr, raw.rahu_kalam.start, timezone);
  const rahuEndDate = parseApiLocalTime(dateStr, raw.rahu_kalam.end, timezone);

  const brahmaMuhurat = sunriseDate
    ? { start: fmtTime(new Date(sunriseDate.getTime() - 96 * 60000)), end: fmtTime(sunriseDate) }
    : null;

  const abhijitMuhurat = (sunriseDate && sunsetDate)
    ? (() => {
        const mid = new Date((sunriseDate.getTime() + sunsetDate.getTime()) / 2);
        return {
          start: fmtTime(new Date(mid.getTime() - 24 * 60000)),
          end: fmtTime(new Date(mid.getTime() + 24 * 60000)),
        };
      })()
    : null;

  // tithi/yoga/karanas each normalized to a list (see asItems/buildTimedEntries
  // above) so the UI can render every entry the API returns — 1 or many —
  // without the parser ever assuming there's only one.
  const tithiRaw = asItems(raw.tithi);
  const yogaRaw = asItems(raw.yoga);
  const karanaRaw = asItems(raw.karanas);
  const tithiEntries = buildTimedEntries(
    tithiRaw.map((t) => ({ ...t, name: t.paksha ? `${t.paksha} ${t.name}` : t.name })),
    { dateStr, timezone, sunriseDate }
  );
  const yogaEntries = buildTimedEntries(yogaRaw, { dateStr, timezone, sunriseDate });
  const karanaEntries = buildTimedEntries(karanaRaw, { dateStr, timezone, sunriseDate });

  // Declarative candidate lists: flipping a `value` from null to a real
  // {start,end} once a source is verified is the only change ever needed —
  // both the filter below and the UI (which just maps over the resulting
  // array) already handle any number of entries automatically.
  const auspiciousCandidates = [
    { name: 'Abhijit Muhurat', value: abhijitMuhurat },
    { name: 'Brahma Muhurta', value: brahmaMuhurat },
    { name: 'Amrit Kaal', value: null },   // not derived — nakshatra-fraction table unverified, see module doc
    { name: 'Vijay Muhurat', value: null }, // not returned by the API; no verified formula added yet
  ];
  const inauspiciousCandidates = [
    { name: 'Rahu Kaal', value: { start: rahuStartDate ? fmtTime(rahuStartDate) : raw.rahu_kalam.start, end: rahuEndDate ? fmtTime(rahuEndDate) : raw.rahu_kalam.end } },
    { name: 'Yamaganda', value: null },   // not derived — see module doc comment
    { name: 'Gulika Kaal', value: null }, // not derived — see module doc comment
    { name: 'Dur Muhurat', value: null }, // not derived — see module doc comment
    { name: 'Varjyam', value: null },     // not derived — see module doc comment
  ];
  const toTimingList = (candidates) => candidates
    .filter((c) => c.value?.start && c.value?.end)
    .map((c) => ({ name: c.name, start: c.value.start, end: c.value.end }));

  return {
    // Existing shape — byte-compatible with the old computePanchang() output
    date: raw.date,
    tithi: tithiEntries[0].name,
    nakshatra: raw.nakshatra.name,
    yoga: yogaEntries[0].name,
    karana: karanaEntries[0].name,
    moonPhase: deriveMoonPhase(tithiRaw[0].number, tithiRaw[0].paksha),
    muhurta: brahmaMuhurat ? `${brahmaMuhurat.start} – ${brahmaMuhurat.end}` : 'Data Not Available',
    sunrise: sunriseDate ? fmtTime(sunriseDate) : raw.sunrise,
    sunset: sunsetDate ? fmtTime(sunsetDate) : raw.sunset,
    rahuKaal: {
      start: rahuStartDate ? fmtTime(rahuStartDate) : raw.rahu_kalam.start,
      end: rahuEndDate ? fmtTime(rahuEndDate) : raw.rahu_kalam.end,
    },

    // Additive fields — safe for existing UI to ignore, available for future use
    paksha: tithiRaw[0].paksha,
    masa: raw.lunar_month?.name || null,
    weekday: raw.weekday.name,
    karanas: karanaEntries.map((k) => k.name), // unchanged shape (name-only list) for any existing reader
    nakshatraPada: raw.nakshatra?.pada ?? null,
    abhijitMuhurat,
    brahmaMuhurat,
    yamaganda: null,   // not derived — see module doc comment
    gulika: null,       // not derived — see module doc comment
    durMuhurat: null,   // not derived — see module doc comment
    varjyam: null,       // not derived — see module doc comment
    moonrise: null,       // not returned by FreeAstroAPI v2 panchang
    moonset: null,         // not returned by FreeAstroAPI v2 panchang

    // New: every Tithi/Yoga/Karana entry the API actually returned, with
    // chained start/end times — the data the client's multi-entry Panchang
    // page requirement renders. See buildTimedEntries above for the
    // start/"Next Day" convention.
    tithiEntries,
    yogaEntries,
    karanaEntries,
    auspiciousTimings: toTimingList(auspiciousCandidates),
    inauspiciousTimings: toTimingList(inauspiciousCandidates),

    metadata: {
      source: 'freeastroapi',
      endpointVersion: raw.metadata?.endpoint_version || null,
      rulesetVersion: raw.metadata?.ruleset_version || null,
      ayanamsha: raw.metadata?.ayanamsha || 'lahiri',
      timezoneUsed: raw.metadata?.timezone_used || timezone,
      lat, lon,
      servedFromCache: false,
    },
  };
};

// ── Cache-through fetch for a single day ────────────────────────────────
const fetchAndCache = async (dateStr, { lat, lon, timezone }) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  const raw = await callFreeAstroApi(buildRequestBody({ year, month, day, lat, lon, timezone }));
  validateResponse(raw);
  const data = normalize(raw, { lat, lon, timezone, dateStr });

  const locationKey = buildLocationKey(lat, lon, timezone, dateStr);
  await PanchangCache.findOneAndUpdate(
    { locationKey },
    { locationKey, date: dateStr, lat, lon, timezone, data, fetchedAt: new Date(), expiresAt: new Date(Date.now() + CACHE_TTL_MS) },
    { upsert: true }
  );
  return data;
};

/**
 * @param {{ date?: string, lat?: number, lon?: number, timezone?: string }} params
 * @returns {Promise<object>} normalized Panchang for that date/location
 * @throws {PanchangUnavailableError} if the API is down/misconfigured and no cache exists
 */
const getPanchang = async ({ date, lat, lon, timezone } = {}) => {
  const tz = timezone || DEFAULT_TZ;
  const dateStr = date || todayInTimezone(tz);
  const la = lat ?? DEFAULT_LAT;
  const lo = lon ?? DEFAULT_LON;

  const locationKey = buildLocationKey(la, lo, tz, dateStr);
  const cached = await PanchangCache.findOne({ locationKey }).lean();
  if (cached && cached.expiresAt > new Date()) {
    return { ...cached.data, metadata: { ...cached.data.metadata, servedFromCache: true } };
  }

  return fetchAndCache(dateStr, { lat: la, lon: lo, timezone: tz });
};

/**
 * 7 days starting at `date` (or today), each independently cached. A single
 * day's failure doesn't abort the rest of the week — the caller gets `null`
 * for that slot, matching the existing frontend/mobile convention of hiding
 * a card when its data is falsy.
 */
const getWeekPanchang = async ({ date, lat, lon, timezone } = {}) => {
  const tz = timezone || DEFAULT_TZ;
  const startDateStr = date || todayInTimezone(tz);
  const days = [];
  for (let i = 0; i < 7; i++) {
    try {
      // eslint-disable-next-line no-await-in-loop -- sequential on purpose, see module doc: stays well under FreeAstroAPI's per-second limits
      days.push(await getPanchang({ date: shiftDateStr(startDateStr, i), lat, lon, timezone: tz }));
    } catch (err) {
      days.push(null);
    }
  }
  return days;
};

module.exports = { getPanchang, getWeekPanchang, PanchangUnavailableError };
