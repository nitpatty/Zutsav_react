const cheerio = require('cheerio');

const DELIM = (i) => `<<<T${i}>>>`;
const DELIM_RE = /<<<T(\d+)>>>/g;

// Collects every non-whitespace text node under `nodes`, depth-first, in
// document order — skips <script>/<style> contents entirely (never sent
// to Groq, left untouched) and never touches tag names or attributes,
// since cheerio's DOM walk structurally never exposes those as "text".
function collectTextNodes(nodes, out) {
  for (const node of nodes || []) {
    if (node.type === 'text') {
      if (node.data && node.data.trim()) out.push(node);
      continue;
    }
    if (node.type === 'tag' && (node.name === 'script' || node.name === 'style')) continue;
    if (node.children) collectTextNodes(node.children, out);
  }
}

/**
 * Translate only the visible text inside an HTML string, preserving all
 * markup (tags, attributes, structure) byte-for-byte. Batches every text
 * run into a single translateFn call (one Groq request per field, not one
 * per node) using `<<<T{n}>>>` delimiters, then reinserts each translated
 * run into its original text node.
 *
 * @param {string} html
 * @param {(batched: string) => Promise<string>} translateFn
 * @returns {Promise<string>}
 */
async function translateHtml(html, translateFn) {
  if (!html || !html.trim()) return html;

  const $ = cheerio.load(html);
  const body = $('body').get(0);
  const textNodes = [];
  collectTextNodes(body?.children, textNodes);

  if (!textNodes.length) return html;

  const batched = textNodes.map((n, i) => `${DELIM(i)}${n.data}`).join('\n');
  const translatedBatch = await translateFn(batched);

  const parts = new Map();
  let match;
  DELIM_RE.lastIndex = 0;
  const matches = [...translatedBatch.matchAll(DELIM_RE)];
  for (let i = 0; i < matches.length; i++) {
    const idx = Number(matches[i][1]);
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : translatedBatch.length;
    parts.set(idx, translatedBatch.slice(start, end).replace(/^\n/, '').replace(/\n$/, ''));
  }

  // Defensive: if Groq dropped/merged a delimiter, the split count won't
  // match — leave the original English text untouched rather than risk a
  // misaligned reinsertion. This is a field-level fallback, not a whole
  // request failure — callers may still succeed on sibling fields.
  if (parts.size !== textNodes.length) return html;

  textNodes.forEach((node, i) => {
    node.data = parts.get(i) ?? node.data;
  });

  return $('body').html();
}

/**
 * Translate an array of plain strings (e.g. tags) in a single call, using
 * the same delimiter-batching convention as translateHtml.
 * @param {string[]} strings
 * @param {(batched: string) => Promise<string>} translateFn
 * @returns {Promise<string[]>}
 */
async function translateStringArray(strings, translateFn) {
  if (!strings || !strings.length) return strings || [];

  const batched = strings.map((s, i) => `${DELIM(i)}${s}`).join('\n');
  const translatedBatch = await translateFn(batched);

  const matches = [...translatedBatch.matchAll(DELIM_RE)];
  if (matches.length !== strings.length) return strings; // same fallback rule as above

  const result = new Array(strings.length);
  for (let i = 0; i < matches.length; i++) {
    const idx = Number(matches[i][1]);
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : translatedBatch.length;
    result[idx] = translatedBatch.slice(start, end).replace(/^\n/, '').replace(/\n$/, '');
  }
  return result;
}

module.exports = { translateHtml, translateStringArray };
