// Client configuration that differs between the two Android apps. NOT a security boundary: which modules exist in an app is
// decided at bundle time by Metro (ZUTSAV_APP_VARIANT, build-config/metroVariant.js), and which roles may sign in by the
// role policy in src/variants/roleSupport.js. This only picks the custom deep-link scheme so it matches the one the flavor's
// manifest registers (android/app/build.gradle manifestPlaceholders.appScheme).
//
// Expo inlines EXPO_PUBLIC_APP_VARIANT at build time; android/app/build.gradle's bundle step sets it per flavor. Unset or any
// value other than "admin" means the Public app (fail closed: the Public scheme, never the Admin one).
export const APP_VARIANT = process.env.EXPO_PUBLIC_APP_VARIANT === 'admin' ? 'admin' : 'public';

// zutsav://register?ref=CODE belongs to the Public app only; the Admin app registers zutsavadmin:// so it can never answer it.
export const APP_SCHEME = process.env.EXPO_PUBLIC_APP_VARIANT === 'admin' ? 'zutsavadmin' : 'zutsav';
