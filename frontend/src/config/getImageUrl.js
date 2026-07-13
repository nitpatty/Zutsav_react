import { serverOrigin } from './urls.config';

/**
 * Resolve a possibly-relative backend file path (image, PDF, etc.) into an
 * absolute URL. Replaces the four different ad hoc patterns that used to be
 * copy-pasted across ~21 files (local `IMG_BASE` constants, inline template
 * literals, `startsWith('http') ? ... :` branches, and a dead
 * `import.meta.env.VITE_API_URL` pattern that never worked in this CRA app).
 */
export function getImageUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${serverOrigin}/${path}`;
}

// Neutral placeholder shown when a resolved image URL 404s/fails to load at
// runtime (e.g. file removed on disk after the DB record was created), so the
// user sees a professional placeholder instead of the browser's broken-image icon.
export const IMAGE_FALLBACK_SRC =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' +
      '<rect width="200" height="200" fill="#f3f4f6"/>' +
      '<g fill="none" stroke="#9ca3af" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect x="40" y="50" width="120" height="100" rx="8"/>' +
        '<circle cx="75" cy="85" r="10"/>' +
        '<path d="M40 130l35-30 30 25 25-20 30 25"/>' +
      '</g>' +
    '</svg>'
  );

// Attach as onError={handleImageError} to any <img src={getImageUrl(...)} />
// to swap a failed load for IMAGE_FALLBACK_SRC instead of a broken-image icon.
export function handleImageError(e) {
  e.currentTarget.onerror = null;
  e.currentTarget.src = IMAGE_FALLBACK_SRC;
}

export default getImageUrl;
