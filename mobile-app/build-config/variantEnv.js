'use strict';

// The environment a variant's bundler child process must receive.
//
//   ZUTSAV_APP_VARIANT       Metro module selection (the build-time security boundary; see metroVariant.js).
//   EXPO_PUBLIC_APP_VARIANT  Inlined into the bundle by Expo; client configuration only (deep-link scheme). NOT a boundary.
//
// An environment that already names the OTHER variant is refused rather than overridden: someone who exported
// ZUTSAV_APP_VARIANT=admin and then built the Public flavor made a mistake that should be visible, not silently "fixed".

const { VARIANTS, VARIANT_ENV } = require('./metroVariant');

const CLIENT_VARIANT_ENV = 'EXPO_PUBLIC_APP_VARIANT';

function variantEnv(variant, baseEnv = process.env) {
  if (!VARIANTS.includes(variant)) {
    throw new Error(`Unsupported variant ${JSON.stringify(variant)}. Supported values: ${VARIANTS.join(', ')}.`);
  }
  for (const name of [VARIANT_ENV, CLIENT_VARIANT_ENV]) {
    const existing = typeof baseEnv[name] === 'string' ? baseEnv[name].trim() : '';
    if (existing !== '' && existing !== variant) {
      throw new Error(
        `${name}=${JSON.stringify(existing)} is set in the environment, but this build is the "${variant}" variant. ` +
        `Unset ${name} (or set it to "${variant}") so the build cannot mix the two apps.`,
      );
    }
  }
  return { ...baseEnv, [VARIANT_ENV]: variant, [CLIENT_VARIANT_ENV]: variant };
}

module.exports = { CLIENT_VARIANT_ENV, variantEnv };
