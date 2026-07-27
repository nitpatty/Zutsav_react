// Converts backend rich-text (HTML) fields — e.g. Pooja.description — into
// clean, readable plain text for surfaces that can't render HTML (RN <Text>).
// Mirrors what the website does visually (headings/paragraphs/lists read as
// separate lines) without needing an HTML renderer for compact card UI.

const ENTITY_MAP = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

const BLOCK_CLOSE_TAGS = /<\/(p|div|h[1-6]|li|tr|blockquote|section|article)>/gi;
const LINE_BREAK_TAGS = /<br\s*\/?>/gi;
const LIST_ITEM_OPEN = /<li[^>]*>/gi;
const ANY_TAG = /<[^>]+>/g;
const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi;

function decodeEntity(match, entity) {
  if (entity[0] === '#') {
    const isHex = entity[1] === 'x' || entity[1] === 'X';
    const code = isHex ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return Number.isNaN(code) ? match : String.fromCodePoint(code);
  }
  const lower = entity.toLowerCase();
  return ENTITY_MAP[lower] !== undefined ? ENTITY_MAP[lower] : match;
}

export function stripHtml(html) {
  if (!html) return '';
  let text = String(html);

  text = text.replace(LINE_BREAK_TAGS, '\n');
  text = text.replace(LIST_ITEM_OPEN, '• ');
  text = text.replace(BLOCK_CLOSE_TAGS, '\n');
  text = text.replace(ANY_TAG, '');
  text = text.replace(ENTITY, decodeEntity);

  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n');
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text;
}
