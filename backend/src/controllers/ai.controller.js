const { getGroqResponse } = require('../utils/groq');

// POST /api/ai/chat
exports.chat = async (req, res, next) => {
  try {
    const { history } = req.body;

    if (!Array.isArray(history) || history.length === 0) {
      return res.status(400).json({ success: false, message: 'history array is required' });
    }

    const lastMsg = history[history.length - 1];
    if (!lastMsg?.text || lastMsg.role !== 'user') {
      return res.status(400).json({ success: false, message: 'Last message must be a user message with text' });
    }

    if (history.length > 20) {
      return res.status(400).json({ success: false, message: 'History too long (max 20 messages)' });
    }

    const reply = await getGroqResponse(history);
    res.json({ success: true, reply });

  } catch (err) {
    const upstreamStatus = err.response?.status;

    // Every failure is logged to stderr — check server console to diagnose API key,
    // rate-limit, or connectivity issues without touching the frontend.
    console.error(
      '[AI /chat] failure —',
      upstreamStatus ? `Groq HTTP ${upstreamStatus}` : err.code || err.message
    );

    // Never let a Groq-level error (401, 429, 5xx) or a missing key
    // propagate as a 401 to the frontend (which would trigger logout).
    // Instead, return 503 so the widget shows a friendly retry message.
    if (
      upstreamStatus ||
      err.code === 'ECONNABORTED' ||
      err.code === 'ENOTFOUND' ||
      err.code === 'ECONNREFUSED' ||
      err.message?.includes('GROQ_API_KEY') ||
      err.message?.includes('Groq')
    ) {
      return res.status(503).json({
        success: false,
        message: "Sorry, I'm unable to respond right now. Please try again in a few moments.",
      });
    }

    next(err);
  }
};
