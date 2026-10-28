// Jest config for the Zutsav mobile app (Expo SDK 51 / RN 0.74).
// `jest-expo` supplies the transform, haste and native-module setup; this file
// only adds project-specific bits. No coverage thresholds yet — establish a
// baseline first (see docs/MOBILE_TESTING.md).
module.exports = {
  preset: 'jest-expo',
  // Native-module mocks, URL config pinned to an unroutable host, per-test reset.
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.[jt]s?(x)'],
  // Keep Jest out of the committed native project and build output.
  modulePathIgnorePatterns: ['<rootDir>/android/', '<rootDir>/dist/'],
  // From the jest-expo docs, plus packages this app uses that ship untranspiled ESM/Flow.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|react-native-reanimated|react-native-url-polyfill)',
  ],
  clearMocks: true,
};
