/* eslint-env jest */
// Global mocks for native modules. Everything is in-memory and reset before
// every test so tests are order-independent and never touch a device or network.

// ── expo-secure-store: in-memory key/value ───────────────────────────────────
const mockSecureStoreData = new Map();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key) => (mockSecureStoreData.has(key) ? mockSecureStoreData.get(key) : null)),
  setItemAsync: jest.fn(async (key, value) => { mockSecureStoreData.set(key, String(value)); }),
  deleteItemAsync: jest.fn(async (key) => { mockSecureStoreData.delete(key); }),
}));

// ── AsyncStorage: official in-memory mock ────────────────────────────────────
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// ── URL config: never depend on a developer's .env or reach a real host ─────
// (babel-preset-expo inlines EXPO_PUBLIC_* at transform time, so env vars can't
// be overridden at runtime — mock the single module that reads them instead.)
jest.mock('./src/config/env', () => ({
  API_URL: 'https://api.test.invalid/api',
  BASE_URL: 'https://api.test.invalid',
  WEB_URL: 'https://web.test.invalid',
}));

// ── Network guard: a test that forgets to mock its API fails loudly ──────────
global.fetch = jest.fn(() => Promise.reject(new Error('Real network access is disabled in tests')));

beforeEach(async () => {
  mockSecureStoreData.clear();
  await require('@react-native-async-storage/async-storage').clear();
  // The UI language lives in a module-level store (and its stored copy was just cleared above). Reset it so a
  // preference chosen in one test can never leak into the next: English, not hydrated, nothing pending sync.
  require('./src/i18n/languageStore').__resetLanguageStore();
});
