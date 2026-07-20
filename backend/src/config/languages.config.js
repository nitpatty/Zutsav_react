// Single source of truth for supported app languages — both the global
// language-preference feature (User.preferredLanguage) and the AI
// translation engine's LANGUAGE_NAMES (utils/groq.js) key off these same
// codes. Adding a language: add it here, add its i18n resource file
// (frontend/src/i18n/locales/<code>.json), done — no other code changes.
const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English',   native: 'English' },
  { code: 'hi', name: 'Hindi',     native: 'हिन्दी' },
  { code: 'mr', name: 'Marathi',   native: 'मराठी' },
  { code: 'gu', name: 'Gujarati',  native: 'ગુજરાતી' },
  { code: 'ta', name: 'Tamil',     native: 'தமிழ்' },
  { code: 'te', name: 'Telugu',    native: 'తెలుగు' },
  { code: 'kn', name: 'Kannada',   native: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
  { code: 'bn', name: 'Bengali',   native: 'বাংলা' },
  { code: 'pa', name: 'Punjabi',   native: 'ਪੰਜਾਬੀ' },
  { code: 'or', name: 'Odia',     native: 'ଓଡ଼ିଆ' },
];

const SUPPORTED_LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

const isSupportedLanguage = (code) => SUPPORTED_LANGUAGE_CODES.includes(String(code || '').toLowerCase());

module.exports = { SUPPORTED_LANGUAGES, SUPPORTED_LANGUAGE_CODES, isSupportedLanguage };
