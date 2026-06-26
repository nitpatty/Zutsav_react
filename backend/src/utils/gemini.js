/**
 * @deprecated — This file is kept only for backward compatibility.
 * All AI functionality has moved to utils/groq.js.
 * Nothing in the codebase imports this file anymore.
 */
const { getGroqResponse, getGeminiResponse } = require('./groq');
module.exports = { getGeminiResponse, getGroqResponse };
