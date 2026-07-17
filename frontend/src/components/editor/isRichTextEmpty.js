// Detects whether a TipTap-produced HTML string represents "no real content" —
// i.e. only empty paragraph(s)/whitespace, no text/images/etc. Prefer
// editor.isEmpty when a live editor instance is available; use this
// string-based check when validating a value pulled from form state without
// a mounted editor (e.g. a submit-time validate() function).
export function isRichTextEmpty(html) {
  if (!html) return true;
  // An image (bare <img> or the resizable-image <figure>) is meaningful
  // content on its own, even with zero text — don't let the tag-stripping
  // below treat an image-only field as empty.
  if (/<img[\s/]/i.test(html)) return false;
  const stripped = html
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
  return stripped.length === 0;
}
