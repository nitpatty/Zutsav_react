/**
 * Guided AI discovery — powers the "Book Now" CTA's AI-guided entry point.
 *
 * This is conversation-flow config + real DB queries, not a second AI/chat
 * system: it reuses groq.js's classifyIntent()/getGroqResponse() call
 * plumbing and the same Pooja/Product models every other controller uses.
 * INTENT_MAP below maps a life-situation to *search keywords*, never to a
 * hardcoded pooja/product name — every recommendation returned to the
 * frontend is a live document fetched at request time.
 */
const Pooja   = require('../models/Pooja');
const Product = require('../models/Product');
const { classifyIntent, getGroqResponse } = require('../utils/groq');

const MAX_RECOMMENDATIONS = 4;

// Top-level intent -> search keywords (+ optional single-level refinement).
// Purely conversation routing config — no pooja/product names live here.
const INTENT_MAP = {
  new_home: {
    label: '🏡 New Home',
    keywords: ['home', 'griha pravesh', 'grihapravesh', 'vastu', 'house warming'],
  },
  career: {
    label: '💼 Career / Job',
    keywords: ['career', 'job', 'work', 'success', 'employment'],
    followUpQuestion: 'I understand. Are you —',
    subIntents: {
      new_job:   { label: 'Looking for a new job?',      keywords: ['job', 'employment', 'career', 'new job'] },
      promotion: { label: 'Waiting for a promotion?',     keywords: ['promotion', 'growth', 'success', 'career'] },
      business:  { label: 'Starting a business?',         keywords: ['business', 'venture', 'wealth', 'lakshmi', 'prosperity'] },
      obstacles: { label: 'Facing workplace obstacles?',  keywords: ['obstacle', 'ganesh', 'vighna', 'problem', 'difficulty'] },
    },
  },
  marriage: {
    label: '💍 Marriage',
    keywords: ['marriage', 'vivah', 'wedding', 'marital'],
  },
  relationship: {
    label: '❤️ Relationship',
    keywords: ['relationship', 'love', 'partner', 'couple', 'harmony'],
  },
  child: {
    label: '👶 Child',
    keywords: ['child', 'santan', 'baby', 'children', 'fertility'],
  },
  wealth: {
    label: '💰 Wealth',
    keywords: ['wealth', 'money', 'lakshmi', 'prosperity', 'finance', 'dhan'],
  },
  peace: {
    label: '🧘 Peace of Mind',
    keywords: ['peace', 'shanti', 'stress', 'calm', 'mind', 'anxiety'],
  },
  general: {
    label: '🛕 General Guidance',
    keywords: ['general', 'guidance', 'blessing', 'wellbeing', 'protection'],
  },
  astrology: {
    label: '🔮 Astrology Consultation',
    // No dedicated Astrology entity exists in this codebase — search still
    // runs (a real dosha/graha-shanti pooja may genuinely apply), but this
    // intent is allowed to fall back to a purely conversational reply
    // instead of forcing a "Book Now" card that doesn't exist.
    keywords: ['dosha', 'graha', 'shanti', 'nakshatra', 'rashi', 'astrology'],
    noBookableEntity: true,
  },
  other: {
    label: '📿 Other',
    keywords: [],
  },
};

function toChipList(map) {
  return Object.entries(map).map(([key, v]) => ({ key, label: v.label }));
}

// GET /api/ai/guided-intents — the fixed top-level chip set (never hardcoded
// in the frontend, so future intents only need adding here).
exports.getIntents = (req, res) => {
  res.json({ success: true, chips: toChipList(INTENT_MAP) });
};

function keywordRegex(keywords) {
  if (!keywords || keywords.length === 0) return null;
  const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(escaped.join('|'), 'i');
}

async function findRecommendations(keywords) {
  const re = keywordRegex(keywords);
  if (!re) return [];

  const poojas = await Pooja.find({
    isActive: true,
    approvalStatus: 'approved',
    isDeleted: { $ne: true },
    $or: [{ name: re }, { shortDesc: re }, { description: re }, { benefits: re }],
  })
    .select('name slug shortDesc image price durationValue durationUnit')
    .limit(MAX_RECOMMENDATIONS)
    .lean();

  const remaining = MAX_RECOMMENDATIONS - poojas.length;
  const products = remaining > 0
    ? await Product.find({
        isActive: true,
        isDeleted: { $ne: true },
        visibilityType: { $in: ['marketplace', 'both'] },
        $or: [{ name: re }, { description: re }, { tags: re }],
      })
        .select('name slug description images price salePrice')
        .limit(remaining)
        .lean()
    : [];

  return [
    ...poojas.map((p) => ({
      type: 'pooja',
      id: String(p._id),
      slug: p.slug,
      name: p.name,
      shortDesc: p.shortDesc || '',
      image: p.image || null,
      price: p.price,
      durationValue: p.durationValue || null,
      durationUnit: p.durationUnit || null,
      bookingUrl: `/book/${p.slug}`,
    })),
    ...products.map((pr) => ({
      type: 'product',
      id: String(pr._id),
      slug: pr.slug,
      name: pr.name,
      shortDesc: pr.description ? pr.description.slice(0, 100) : '',
      image: pr.images?.[0] || null,
      price: pr.salePrice ?? pr.price,
      durationValue: null,
      durationUnit: null,
      bookingUrl: `/marketplace/product/${pr.slug}`,
    })),
  ];
}

// POST /api/ai/guided-recommend
// Body: { intentKey?, subIntentKey?, freeText? }
exports.recommend = async (req, res, next) => {
  try {
    const { intentKey: rawIntentKey, subIntentKey, freeText } = req.body;
    let intentKey = rawIntentKey;

    // Free-typed text (no chip clicked yet) — classify into a known intent,
    // never let it drive the DB query directly.
    if (!intentKey && freeText) {
      intentKey = await classifyIntent(freeText, Object.keys(INTENT_MAP));
    }

    if (!intentKey || !INTENT_MAP[intentKey] || intentKey === 'other') {
      return res.json({
        success: true,
        needsClarification: true,
        aiMessage: "I'd love to help — could you tell me a bit more about what's on your mind?",
        followUpQuestion: 'Or pick whichever feels closest:',
        chips: toChipList(INTENT_MAP),
      });
    }

    const intent = INTENT_MAP[intentKey];

    // Top-level intent has a refinement step and no sub-intent chosen yet —
    // ask the follow-up question instead of guessing which angle to search.
    if (intent.subIntents && !subIntentKey) {
      return res.json({
        success: true,
        needsClarification: true,
        intentKey,
        aiMessage: intent.followUpQuestion,
        chips: Object.entries(intent.subIntents).map(([key, v]) => ({ key, label: v.label })),
      });
    }

    const keywords = subIntentKey && intent.subIntents?.[subIntentKey]
      ? intent.subIntents[subIntentKey].keywords
      : intent.keywords;

    const recommendations = await findRecommendations(keywords);

    if (recommendations.length === 0) {
      if (intent.noBookableEntity) {
        // Astrology-class intent with no matching pooja either — respond
        // conversationally using the same general assistant, no fake card.
        const reply = await getGroqResponse([
          { role: 'user', text: freeText || `Tell me about ${intent.label.replace(/^\S+\s/, '')}` },
        ]);
        return res.json({ success: true, aiMessage: reply, recommendations: [], conversational: true });
      }
      return res.json({
        success: true,
        needsClarification: true,
        aiMessage: "I don't have an exact match for that yet — could you describe your situation a little more?",
        chips: toChipList(INTENT_MAP),
      });
    }

    // One short Groq call to narrate the already-fetched real results —
    // it introduces the list, it does not invent items.
    const names = recommendations.map((r) => r.name).join(', ');
    const aiMessage = await getGroqResponse([
      {
        role: 'user',
        text: `In one warm sentence (max 30 words), introduce these exact recommended options to the user without adding any other items: ${names}. Do not use markdown.`,
      },
    ]).catch(() => `Based on what you've shared, here's what I'd recommend:`);

    res.json({ success: true, intentKey, subIntentKey: subIntentKey || null, aiMessage, recommendations });
  } catch (err) { next(err); }
};
