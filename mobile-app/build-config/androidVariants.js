'use strict';

// The two Android product flavors and what each one means. android/app/build.gradle declares the same values (a Jest test
// compares the two), and the scripts in scripts/ read them from here. Public is listed first: it is the safe default.
const FLAVORS = Object.freeze({
  publicApp: Object.freeze({
    variant: 'public',
    applicationId: 'com.zutsav.app',
    label: 'Zutsav',
    scheme: 'zutsav',
    devPort: 8081,
    releaseSigningPrefix: 'ZUTSAV_PUBLIC_RELEASE',
  }),
  adminApp: Object.freeze({
    variant: 'admin',
    applicationId: 'com.zutsav.app.admin',
    label: 'Zutsav Admin',
    scheme: 'zutsavadmin',
    devPort: 8082,
    releaseSigningPrefix: 'ZUTSAV_ADMIN_RELEASE',
  }),
});

const flavorForVariant = (variant) => Object.keys(FLAVORS).find((f) => FLAVORS[f].variant === variant);
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Gradle task / variant names: <flavor><BuildType> for variants, <verb><Flavor><BuildType> for tasks.
const variantName = (flavor, buildType) => `${flavor}${capitalize(buildType)}`;
const taskName = (verb, flavor, buildType) => `${verb}${capitalize(flavor)}${capitalize(buildType)}`;

module.exports = { FLAVORS, flavorForVariant, variantName, taskName };
