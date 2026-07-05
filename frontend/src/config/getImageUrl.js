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

export default getImageUrl;
