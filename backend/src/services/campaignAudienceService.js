/**
 * Campaign Audience Service — consent-aware recipient discovery for a
 * coupon campaign.
 *
 * A campaign NEVER loads the full audience into memory. Discovery streams
 * recipients one cursor page at a time (seek by _id), yielding bounded
 * batches for enqueue, so a 100k-opted-in audience is processed with
 * constant memory.
 *
 * The authoritative consent source is the SAME state WhatsAppChannel reads
 * live at send time (WhatsAppPreference.whatsapp.marketing.status ===
 * 'opted_in'), so a user who opts out after being enqueued is still blocked
 * at the channel gate (defense in depth). Filtering here is an efficiency
 * optimization (don't enqueue jobs that would only be skipped) — it never
 * replaces the channel gate.
 */

const User = require('../models/User');
const WhatsAppPreference = require('../models/WhatsAppPreference');

const DEFAULT_PAGE_SIZE = 500;

/**
 * Build the selection query for a campaign's audienceType.
 *
 * v1 only implements ALL_MARKETING_OPTED_IN_USERS. Other strategies return
 * a falsy query so the caller can reject them as not-yet-supported (the
 * campaign service guards this too).
 *
 * @returns {object|null} a Mongo filter on WhatsAppPreference, or null when
 *   the audienceType is not implemented.
 */
function buildPreferenceFilter(campaign) {
  const audienceType = campaign.audienceType || 'ALL_MARKETING_OPTED_IN_USERS';
  if (audienceType !== 'ALL_MARKETING_OPTED_IN_USERS') {
    return null;
  }
  return { 'whatsapp.marketing.status': 'opted_in' };
}

function sortByCursor(direction) {
  return direction === 'forward'
    ? { _id: 1 }
    : { _id: -1 };
}

/**
 * One page of eligible recipients.
 *
 * @param {object} campaign  - CouponCampaign document
 * @param {object} [opts]
 * @param {string} [opts.direction='forward'] - 'forward' or 'backward'
 * @param {string} [opts.cursor] - last _id (string) from the previous page
 * @param {number} [opts.limit] - page size
 * @returns {Promise<{ recipients: Array<{userId, phone, email, name, preferredLanguage}>, nextCursor: string|null, complete: boolean }>}
 */
async function discoverPage(campaign, opts = {}) {
  const direction = opts.direction === 'backward' ? 'backward' : 'forward';
  const limit = Math.min(Number(opts.limit) || DEFAULT_PAGE_SIZE, 2000);

  const filter = buildPreferenceFilter(campaign);
  if (!filter) return { recipients: [], nextCursor: null, complete: true };

  // Cursor-based pagination (seek method): stable across inserts/deletes
  // between pages, unlike skip/limit.
  const cur = opts.cursor ? { _id: direction === 'forward' ? { $gt: opts.cursor } : { $lt: opts.cursor } } : {};

  const prefs = await WhatsAppPreference.find({ ...filter, ...cur })
    .sort(sortByCursor(direction))
    .select('userId phone whatsapp.marketing.status')
    .limit(limit + 1)
    .lean();

  let rows = prefs;
  let nextCursor = null;
  if (prefs.length > limit) {
    rows = prefs.slice(0, limit);
    nextCursor = String(rows[rows.length - 1]._id);
  }

  const userIds = rows.map((p) => p.userId).filter(Boolean);
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } })
        .select('name phone email preferredLanguage role isDeleted isActive whatsappVerified')
        .lean()
    : [];

  const userById = new Map(users.map((u) => [String(u._id), u]));

  const recipients = [];
  for (const p of rows) {
    const user = userById.get(String(p.userId));
    if (!user) continue;
    // Only real, non-deleted, active user accounts receive marketing.
    if (user.isDeleted || user.isActive === false) continue;
    recipients.push({
      userId: String(user._id),
      name: user.name || '',
      phone: user.phone || '',
      email: user.email || '',
      preferredLanguage: user.preferredLanguage || 'en',
    });
  }

  return { recipients, nextCursor, complete: nextCursor === null };
}

/**
 * Count the eligible audience (for preview / admin display). Accepts an
 * optional cap so preview never scans the whole collection needlessly.
 */
async function countAudience(campaign, cap = 100000) {
  const filter = buildPreferenceFilter(campaign);
  if (!filter) return 0;
  const n = await WhatsAppPreference.countDocuments(filter);
  return Math.min(n, cap);
}

module.exports = {
  discoverPage,
  countAudience,
  buildPreferenceFilter,
  DEFAULT_PAGE_SIZE,
};
