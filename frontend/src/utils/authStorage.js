// Single place that decides where the auth token/user live: localStorage
// (survives browser restart — "Remember Me" checked) or sessionStorage
// (cleared when the tab/browser closes — unchecked). AuthContext.jsx and
// api/axios.js both go through this instead of hardcoding a storage object,
// so the two can never disagree about where the session actually lives.

const TOKEN_KEY = 'zutsav_token';
const USER_KEY  = 'zutsav_user';

export function saveAuth(token, user, remember) {
  const store = remember ? localStorage : sessionStorage;
  const other = remember ? sessionStorage : localStorage;
  store.setItem(TOKEN_KEY, token);
  store.setItem(USER_KEY, JSON.stringify(user));
  // Clear the other location so a prior session of the opposite kind can't
  // linger and be read back accidentally.
  other.removeItem(TOKEN_KEY);
  other.removeItem(USER_KEY);
}

export function readToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

export function readUser() {
  try {
    const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function updateStoredUser(user) {
  // Update whichever location currently holds the session.
  if (localStorage.getItem(TOKEN_KEY)) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else if (sessionStorage.getItem(TOKEN_KEY)) sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}
