const { readEnv } = require('./env');

// Fixed third-party API hosts. These aren't deployment-configurable (they're
// the vendor's own endpoints), but were previously hardcoded in 2+ places
// each (e.g. the WhatsApp Graph host in both `whatsapp.js` and
// `comm.controller.js`, PhonePe's sandbox/prod hosts inline in `phonepe.js`).
// Centralized here so there's exactly one place to update if a vendor ever
// changes their API host.
const vendors = {
  phonepe: {
    sandboxUrl: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
    prodUrl: 'https://api.phonepe.com/apis/hermes',
  },
  groq: {
    apiUrl: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.3-70b-versatile',
  },
  sarvam: {
    // Sarvam AI — Indian-language translation (primary content-translation
    // provider; Groq remains the temporary fallback). See
    // services/translationProviders/sarvam.provider.js.
    translateUrl: 'https://api.sarvam.ai/translate',
    defaultModel: 'sarvam-translate:v1',
    timeoutMs: 15000,   // per HTTP request — well under cleanupJobs' 2-min stale-lock sweep
    maxInputChars: 1900, // API hard limit is 2,000; margin keeps multi-byte/edge cases safe
  },
  freeastroapi: {
    panchangUrl: 'https://api.freeastroapi.com/api/v2/vedic/panchang',
  },
  whatsapp: {
    graphApiBase: 'https://graph.facebook.com',
  },
  tekipost: {
    baseUrl: 'https://app.tekipost.com',
  },
  olamaps: {
    baseUrl: 'https://api.olamaps.io',
    autocompletePath: '/places/v1/autocomplete',
    geocodePath: '/places/v1/geocode',
    reverseGeocodePath: '/places/v1/reverse-geocode',
  },
};

const database = {
  mongoUri: readEnv('MONGO_URI') || 'mongodb://localhost:27017/zutsav',
};

module.exports = { ...vendors, database };
