/**
 * AnalyticsContext — single centralized Microsoft Clarity provider.
 *
 * Placement in the tree:
 *   BrowserRouter > AuthProvider > ... > AppRoutes > AnalyticsProvider
 *
 * This gives AnalyticsProvider access to:
 *   - useLocation (inside BrowserRouter) — for SPA route tracking
 *   - useAuth     (inside AuthProvider)  — for user identification
 *
 * Rules:
 *   - Clarity is initialized exactly once per application lifecycle.
 *   - Route changes are tracked automatically via useLocation.
 *   - User identification uses only the internal DB _id — never PII.
 *   - If the env variable is absent, everything is a no-op.
 */

import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { initClarity, trackPageView, identifyUser, clearUserIdentity } from '../utils/clarity';

const AnalyticsContext = createContext(null);

export function AnalyticsProvider({ children }) {
  const location = useLocation();
  const { user } = useAuth();
  const didInit = useRef(false);
  const prevUserId = useRef(null);

  /* ── Step 1: Initialize Clarity exactly once ──────────────────────── */
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    initClarity();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Step 2: Track every SPA route change ─────────────────────────── */
  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  /* ── Step 3: Identify / de-identify on auth state changes ─────────── */
  useEffect(() => {
    const currentId = user?._id ?? null;

    // Skip when the user identity has not actually changed to prevent
    // redundant identify calls on unrelated re-renders.
    if (currentId === prevUserId.current) return;
    prevUserId.current = currentId;

    if (currentId) {
      identifyUser(currentId, user?.role);
    } else {
      clearUserIdentity();
    }
  }, [user?._id, user?.role]);

  return (
    <AnalyticsContext.Provider value={null}>
      {children}
    </AnalyticsContext.Provider>
  );
}

/**
 * Hook available for future custom event tracking without coupling to window.clarity.
 * Currently returns null — extend AnalyticsContext.Provider value when needed.
 */
export const useAnalytics = () => useContext(AnalyticsContext);
