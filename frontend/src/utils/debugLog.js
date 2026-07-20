const isDev = process.env.NODE_ENV === 'development';

// Temporary language-switching diagnostics (see LanguageContext.jsx,
// api/axios.js, hooks/useTranslatedBlog.js) — auto-disabled in production
// builds since it's gated on NODE_ENV, not a manual toggle.
export function langDebug(...args) {
  if (isDev) console.debug('[i18n-debug]', ...args);
}
