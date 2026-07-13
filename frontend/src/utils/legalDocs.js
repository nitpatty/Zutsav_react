import { serverOrigin } from '../config/urls.config';

// Builds the URL to open a legal document in a new tab. PDFs are served
// inline directly by the backend; DOC/DOCX have no native browser renderer,
// so they're wrapped in Google's public online viewer instead.
export function resolveViewUrl(doc) {
  const absoluteViewUrl = `${serverOrigin}${doc.viewUrl}`;
  if (doc.mimeType === 'application/pdf') return absoluteViewUrl;
  return `https://docs.google.com/viewer?url=${encodeURIComponent(absoluteViewUrl)}&embedded=true`;
}
