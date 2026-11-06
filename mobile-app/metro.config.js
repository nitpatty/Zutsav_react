const { getDefaultConfig } = require('expo/metro-config');
const { resolveVariant, withVariant } = require('./build-config/metroVariant');

// The app variant is chosen here, at bundle time, from ZUTSAV_APP_VARIANT ("public" by default, "admin" only when set
// explicitly; anything else is an error). See build-config/metroVariant.js and docs/PUBLIC_PRIVATE_BUILD_VERIFICATION.md.
const config = getDefaultConfig(__dirname);
module.exports = withVariant(config, { projectRoot: __dirname, variant: resolveVariant() });
