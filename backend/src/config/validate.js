const { NODE_ENV, readEnv } = require('./env');

/**
 * Startup validation. Always-required vars fail fast in every environment;
 * a second tier is only enforced in production, where a silent localhost
 * fallback would otherwise mask a real misconfiguration.
 */
function validateConfig() {
  const missing = [];

  if (!readEnv('JWT_SECRET')) {
    missing.push('  - JWT_SECRET: required to sign/verify auth tokens.');
  }

  if (NODE_ENV === 'production') {
    if (!readEnv('MONGO_URI')) {
      missing.push('  - MONGO_URI: not set — would silently fall back to a localhost database that will not exist on this server.');
    }
    if (!readEnv('CLIENT_URL', 'FRONTEND_URL')) {
      missing.push('  - CLIENT_URL: not set — CORS, email links, and Socket.IO would fall back to localhost.');
    }
    if (!readEnv('SERVER_URL', 'BACKEND_URL')) {
      missing.push('  - SERVER_URL: not set — payment webhook URLs would point at localhost.');
    }
  }

  if (missing.length) {
    console.error(
      `\n❌ Missing required configuration for NODE_ENV=${NODE_ENV}:\n${missing.join('\n')}\n\n` +
      'Set these in backend/.env (or backend/.env.production) and restart.\n'
    );
    process.exit(1);
  }
}

module.exports = { validateConfig };
