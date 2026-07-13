const { NODE_ENV } = require('./env');
const urls = require('./urls.config');
const cors = require('./cors.config');
const integrations = require('./integrations.config');
const company = require('./company.config');
const constants = require('./constants');

// Single aggregate export. Anywhere in backend/src that needs a deployment
// value should `require('../config')` (or the relevant sub-path) instead of
// reading `process.env` directly.
module.exports = {
  env: NODE_ENV,
  server: { port: process.env.PORT || 5000 },
  urls,
  cors,
  integrations,
  company,
  constants,
};
