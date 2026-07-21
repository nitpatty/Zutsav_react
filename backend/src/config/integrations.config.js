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
  freeastroapi: {
    panchangUrl: 'https://api.freeastroapi.com/api/v2/vedic/panchang',
  },
  whatsapp: {
    graphApiBase: 'https://graph.facebook.com',
  },
  tekipost: {
    baseUrl: 'https://app.tekipost.com',
  },
};

const database = {
  mongoUri: readEnv('MONGO_URI') || 'mongodb://localhost:27017/zutsav',
};

module.exports = { ...vendors, database };
