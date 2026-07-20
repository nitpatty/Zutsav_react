import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import i18n from '../i18n';
import API from '../api/axios';
import { useAuth } from './AuthContext';
import { getStoredLanguage, setStoredLanguage } from '../utils/languageStorage';
import { updateStoredUser } from '../utils/authStorage';
import { langDebug } from '../utils/debugLog';

// Single global app-language preference — drives BOTH the static i18n layer
// (nav/buttons/forms) and the `lang` param the Axios interceptor attaches to
// every content request (see api/axios.js). There is deliberately no
// per-page language state anywhere else in the app; every page reads this
// one context.
const LanguageContext = createContext(null);

export const LanguageProvider = ({ children }) => {
  const { user, isAuthenticated, setUser } = useAuth();
  const queryClient = useQueryClient();
  const [lang, setLangState] = useState(() => getStoredLanguage());

  // Every consumer that reads `lang` reactively (React state) re-renders on
  // its own schedule — but `applyLanguage` needs to know the *previous*
  // value synchronously, at call time, not whatever a stale closure captured
  // when the callback was created. A ref updated every render is the only
  // thing guaranteed to be current.
  const langRef = useRef(lang);
  langRef.current = lang;

  // Apply the initial language to i18n on mount (context state starts from
  // storage; i18n itself defaults to 'en' until this runs).
  useEffect(() => {
    if (i18n.language !== lang) i18n.changeLanguage(lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The ONE place that actually switches the active language. Every layer
  // (i18n, localStorage, React Query cache, backend preference, AuthContext)
  // is updated from here, synchronously where possible, so there is never a
  // window where one layer disagrees with another about what the current
  // language is.
  const applyLanguage = useCallback((code, { persistToBackend } = {}) => {
    if (langRef.current === code) {
      langDebug('applyLanguage no-op — already on', code);
      return;
    }
    const previous = langRef.current;
    langDebug(`Switching language: ${previous} -> ${code}`);

    langRef.current = code;
    setLangState(code);
    setStoredLanguage(code);
    i18n.changeLanguage(code);
    langDebug('i18n.language is now', i18n.language, '| localStorage lang is now', getStoredLanguage());

    // Every language-keyed React Query cache entry (query keys always embed
    // `lang`, e.g. ['blog', slug, lang]) becomes irrelevant the instant the
    // language changes. Without this, a request already in flight for the
    // PREVIOUS language can still resolve and populate a cache entry after
    // the switch — invalidating here forces every mounted query to treat
    // this as a completely fresh language context and refetch under its new
    // key rather than ever serving a previous-language response.
    queryClient.invalidateQueries();
    langDebug('React Query cache invalidated after language switch');

    if (persistToBackend && isAuthenticated) {
      API.patch('/auth/preferred-language', { preferredLanguage: code })
        .then(() => {
          // Keep AuthContext's user object — both the React state AND its
          // localStorage/sessionStorage mirror — in sync immediately. If we
          // don't, user.preferredLanguage silently drifts from the
          // just-selected language: the "DB value wins" effect below would
          // then see that stale value (either right away, or after a page
          // refresh re-reads the stale persisted blob) and revert this
          // manual switch out from under the user — the exact "multiple
          // active language states" bug. The functional updater form is
          // required here (not the `user` from this closure) since it's the
          // only way to guarantee we merge onto the truly-latest state by
          // the time this async callback runs.
          setUser((prev) => {
            if (!prev) return prev;
            const next = { ...prev, preferredLanguage: code };
            updateStoredUser(next);
            return next;
          });
          langDebug('Preference persisted to backend; AuthContext.user synced to', code);
        })
        .catch(() => {
          toast.error('Could not save your language preference. It will still apply for this session.');
        });
    }
  }, [isAuthenticated, queryClient, setUser]);

  // DB value is always authoritative for a logged-in user — this fires right
  // after login/refreshUser and overrides whatever a guest session had
  // locally, per the "database value wins" rule. Logging out leaves the
  // locally-stored value as the guest fallback rather than resetting to 'en'.
  // Because applyLanguage() keeps user.preferredLanguage in sync on every
  // manual switch (above), this effect only ever fires for a genuine
  // login-time reconciliation — never as a side effect of the user's own
  // language picks.
  useEffect(() => {
    if (isAuthenticated && user?.preferredLanguage && user.preferredLanguage !== langRef.current) {
      langDebug('DB preference differs from active language on login — applying DB value', {
        db: user.preferredLanguage, active: langRef.current,
      });
      applyLanguage(user.preferredLanguage, { persistToBackend: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.preferredLanguage]);

  const setLang = useCallback((code) => applyLanguage(code, { persistToBackend: true }), [applyLanguage]);

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be inside LanguageProvider');
  return ctx;
};
