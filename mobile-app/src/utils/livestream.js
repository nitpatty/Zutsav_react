/**
 * Livestream mapping for GET /api/livestreams.
 *
 * Real response (livestream.controller.js → getLivestreams): the server already
 * returns only `isActive: true` streams, newest first, as
 *   { success, livestreams: [{ _id, title, description, youtubeUrl, isActive,
 *       templeId: { name, city, state } | id, createdAt }] }
 * There is no `streamUrl`, `status`, host or viewer count in the model.
 */

const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com', 'youtube-nocookie.com'];

/**
 * Returns a safe https YouTube URL, or null when the value is missing, malformed,
 * not http(s), or not a YouTube host. Only this result is ever passed to Linking
 * — never an arbitrary admin-entered string (no `javascript:`, `intent:`, `file:` …).
 */
export function safeYouTubeUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let u;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (!YOUTUBE_HOSTS.includes(u.hostname.toLowerCase())) return null;
  // A bare host with no video/channel/live path is not a playable stream.
  const hasTarget = u.searchParams.get('v') || (u.pathname && u.pathname !== '/');
  if (!hasTarget) return null;
  return `https://${u.hostname.toLowerCase()}${u.pathname}${u.search}`;
}

export function mapLivestream(raw) {
  const temple = raw?.templeId && typeof raw.templeId === 'object' ? raw.templeId : null;
  return {
    id: raw?._id,
    title: raw?.title || '', // the screen supplies the localized fallback title
    description: raw?.description || '',
    url: safeYouTubeUrl(raw?.youtubeUrl),
    templeName: temple?.name || '',
    templeLocation: temple ? [temple.city, temple.state].filter(Boolean).join(', ') : '',
  };
}

/** Maps the response body to the streams the screen should show (active only). */
export function mapLivestreams(body) {
  const list = Array.isArray(body?.livestreams) ? body.livestreams : (Array.isArray(body?.data) ? body.data : []);
  return list
    .filter((s) => s && typeof s === 'object' && s._id && s.isActive !== false)
    .map(mapLivestream);
}
