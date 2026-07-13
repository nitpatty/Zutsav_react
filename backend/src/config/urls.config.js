const { readEnv } = require('./env');

// CLIENT_URL/SERVER_URL are canonical; FRONTEND_URL/BACKEND_URL are accepted
// as legacy aliases so existing deployments don't break.
const clientUrl = readEnv('CLIENT_URL', 'FRONTEND_URL') || 'http://localhost:3000';
const serverUrl = readEnv('SERVER_URL', 'BACKEND_URL') || 'http://localhost:5000';
const adminUrl = readEnv('ADMIN_URL') || clientUrl;
const socketUrl = readEnv('SOCKET_URL') || serverUrl;

module.exports = { clientUrl, serverUrl, adminUrl, socketUrl };
