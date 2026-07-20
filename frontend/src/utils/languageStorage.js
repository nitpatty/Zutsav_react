const STORAGE_KEY = 'zutsav_preferred_language';

// Guest (pre-login) language preference, and the fast client-side mirror of
// an authenticated user's DB preference. The Axios interceptor (api/axios.js)
// reads this directly on every request, so LanguageContext must keep it in
// sync immediately whenever the active language changes — never let it go
// stale relative to the value the rest of the app is using.
export function getStoredLanguage() {
  return localStorage.getItem(STORAGE_KEY) || 'en';
}

export function setStoredLanguage(code) {
  localStorage.setItem(STORAGE_KEY, code);
}
