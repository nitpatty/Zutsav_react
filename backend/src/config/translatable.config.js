// Registry of content types the translation engine (services/translationService.js)
// knows how to translate. Adding a new content type is config-only — no engine changes.
//
// Field `type`:
//   'text'      - plain string, translated as-is
//   'html'      - rich-text HTML string (e.g. TipTap output) — only visible text is
//                 translated, markup/attributes are preserved untouched
//   'string[]'  - array of plain strings (e.g. tags)
//   'object[]'  - array of objects with a per-key type map (e.g. FAQs), via `shape`
//
// `maxTokens` bounds the Groq response size for that field.
module.exports = {
  blog: {
    model: () => require('../models/Blog'),
    versionField: 'translationVersion',
    fields: {
      title:          { type: 'text',     maxTokens: 100 },
      excerpt:        { type: 'text',     maxTokens: 300 },
      content:        { type: 'html',     maxTokens: 4000 },
      tags:           { type: 'string[]', maxTokens: 300 },
      seoTitle:       { type: 'text',     maxTokens: 100 },
      seoDescription: { type: 'text',     maxTokens: 300 },
    },
  },

  poojaCategory: {
    model: () => require('../models/PoojaCategory'),
    versionField: 'translationVersion',
    fields: {
      name:        { type: 'text', maxTokens: 100 },
      description: { type: 'text', maxTokens: 400 },
    },
  },

  pooja: {
    model: () => require('../models/Pooja'),
    versionField: 'translationVersion',
    fields: {
      name:            { type: 'text',     maxTokens: 100 },
      shortDesc:       { type: 'text',     maxTokens: 300 },
      description:     { type: 'html',     maxTokens: 3000 },
      vidhi:           { type: 'html',     maxTokens: 3000 },
      samagriNotes:    { type: 'html',     maxTokens: 2000 },
      benefitsContent: { type: 'html',     maxTokens: 2000 },
      additionalInfo:  { type: 'html',     maxTokens: 2000 },
      requirements:    { type: 'string[]', maxTokens: 400 },
      benefits:        { type: 'string[]', maxTokens: 400 },
      faqs:            { type: 'object[]', maxTokens: 500, shape: { question: 'text', answer: 'html' } },
    },
  },

  product: {
    model: () => require('../models/Product'),
    versionField: 'translationVersion',
    fields: {
      name:        { type: 'text',     maxTokens: 100 },
      description: { type: 'text',     maxTokens: 500 },
      tags:        { type: 'string[]', maxTokens: 300 },
    },
    // Never register: price, salePrice, stock, sku, taxRate, variants[].* — numeric/system data.
  },

  kit: {
    model: () => require('../models/Kit'),
    versionField: 'translationVersion',
    fields: {
      name:        { type: 'text', maxTokens: 100 },
      description: { type: 'text', maxTokens: 500 },
    },
  },

  temple: {
    model: () => require('../models/Temple'),
    versionField: 'translationVersion',
    fields: {
      name:        { type: 'text', maxTokens: 100 },
      description: { type: 'text', maxTokens: 800 },
    },
    // Never register: address/city/state/pincode/latitude/longitude — location data.
  },

  festival: {
    model: () => require('../models/Festival'),
    versionField: 'translationVersion',
    fields: {
      name:        { type: 'text', maxTokens: 100 },
      description: { type: 'text', maxTokens: 800 },
      panchang:    { type: 'text', maxTokens: 300 },
    },
    // Never register: date, tithiDate, hinduMonth, paksha, nakshatra, vrat — fixed
    // calendar vocabulary, better served by static i18n than per-row AI translation.
  },

  notificationMapping: {
    model: () => require('../models/NotificationMapping'),
    versionField: 'translationVersion',
    fields: {
      inAppTitle:   { type: 'text', maxTokens: 150 },
      inAppMessage: { type: 'text', maxTokens: 300 },
    },
  },

  // Free-text fallback only (broadcast messages, blog-rejection reasons — anything
  // created via createNotification() with no matching NotificationMapping template).
  notification: {
    model: () => require('../models/Notification'),
    versionField: 'translationVersion',
    fields: {
      title:   { type: 'text', maxTokens: 150 },
      message: { type: 'text', maxTokens: 300 },
    },
  },
};
