/**
 * Temple mapping for GET /api/temples and GET /api/temples/:id.
 *
 * Real fields (backend/src/models/Temple.js): name, address (street line, a plain
 * string), city, state, pincode, description, category, primaryDeity,
 * openingHours, coverImage, images[], latitude, longitude.
 * There is NO phone, website, street, deity or timings — so none is shown.
 * Gallery order matches the website: coverImage first, then images[].
 * Values are returned as-is (raw upload paths); resolve with imageUrl() to render.
 */
const str = (v) => (typeof v === 'string' ? v.trim() : '');

export function mapTemple(raw) {
  const t = raw && typeof raw === 'object' ? raw : {};
  const images = [];
  [t.coverImage, ...(Array.isArray(t.images) ? t.images : [])].forEach((p) => {
    const path = str(p);
    if (path && !images.includes(path)) images.push(path);
  });
  return {
    id: t._id,
    name: str(t.name),
    city: str(t.city),
    state: str(t.state),
    location: [str(t.city), str(t.state)].filter(Boolean).join(', '),
    fullAddress: [str(t.address), str(t.city), str(t.state), str(t.pincode)].filter(Boolean).join(', '),
    primaryDeity: str(t.primaryDeity),
    openingHours: str(t.openingHours),
    category: str(t.category),
    description: str(t.description),
    images,
  };
}

/** Maps a list response ({ temples: [...] }) to renderable temples (skips malformed rows). */
export function mapTemples(body) {
  const list = Array.isArray(body?.temples) ? body.temples : (Array.isArray(body?.data) ? body.data : []);
  return list.filter((t) => t && typeof t === 'object' && t._id).map((t) => ({ ...mapTemple(t), raw: t }));
}
