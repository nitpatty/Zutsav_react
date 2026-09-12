// Resolves a legal document to the in-app Zutsav viewer route. The raw
// /api/documents/:type/view URL is never exposed as a navigation target —
// the viewer page fetches the public metadata and renders the PDF through
// the view endpoint internally, so users stay inside the Zutsav experience
// (no raw-PDF browser tab, no browser-native PDF toolbar).
export function resolveViewUrl(doc) {
  return `/legal/${doc.documentType}`;
}