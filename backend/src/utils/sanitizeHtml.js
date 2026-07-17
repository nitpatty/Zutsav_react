// Basic XSS protection for rich-text HTML saved from the TipTap editors
// (Blog content, Pooja description/vidhi/samagri/benefits/faqs/etc).
// Strips script tags, inline event handlers, javascript: URIs and iframes.
function sanitizeHtml(html = '') {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
}

module.exports = { sanitizeHtml };
