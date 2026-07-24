import { create } from 'zustand';
import api from '../api/axios';

// Drives the Pandit Approval Gate in RootNavigator. Separate from the
// dashboard's own `/pandits/me/dashboard` fetch (getMyDashboard deliberately
// omits the application-level `status` field — see backend
// pandit.controller.js) — this store is the single source of truth for
// `pandit.status` (pending/under_review/approved/rejected/suspended/
// reupload_required), fetched from GET /pandits/me.
//
// RootNavigator's user-change effect and PanditStatusScreen's focus-refetch
// (plus pull-to-refresh / manual Refresh Status) can all call fetch() close
// together. Without ordering, a slower *older* response could resolve after
// a faster *newer* one and overwrite the store with stale data — for an
// authorization gate that's a real risk (a stale 'approved' could clobber a
// fresh 'suspended'). `seq` guards against exactly that: only the response
// to the most recently-issued call is ever committed.
let seq = 0;

export const usePanditStatusStore = create((set, get) => ({
  pandit: null,
  phase: 'idle', // idle | loading | loaded | not_found | error
  // Set true the moment the FIRST fetch (success or failure) resolves.
  // RootNavigator gates on this — NOT on `phase === 'loading'` — so that a
  // failed/retried fetch only updates content inside the already-mounted
  // gate screen instead of unmounting it back to the boot spinner. Gating on
  // `phase` directly caused exactly that: every failure flipped `phase` away
  // from 'loading', which remounted the gate screen, whose own focus-effect
  // immediately re-fetched, flipping `phase` back to 'loading' and unmounting
  // it again — an unthrottled infinite loop that DDoS'd this endpoint into
  // its own rate limiter.
  checkedOnce: false,
  lastFetchedAt: null,

  fetch: async () => {
    const mySeq = ++seq;
    set({ phase: 'loading' });
    try {
      const { data } = await api.get('/pandits/me');
      if (mySeq !== seq) return null; // superseded by a later call
      set({ pandit: data.pandit, phase: 'loaded', checkedOnce: true, lastFetchedAt: new Date() });
      return data.pandit;
    } catch (err) {
      if (mySeq !== seq) return null;
      if (err.response?.status === 404) {
        set({ pandit: null, phase: 'not_found', checkedOnce: true, lastFetchedAt: new Date() });
      } else {
        set({ phase: 'error', checkedOnce: true, lastFetchedAt: new Date() });
      }
      return null;
    }
  },

  reset: () => { seq += 1; set({ pandit: null, phase: 'idle', checkedOnce: false, lastFetchedAt: null }); },
}));

// Statuses that must NOT reach the dashboard — mirrors the exact enum on
// backend/src/models/Pandit.js (`status` field). Only 'approved' passes.
export const BLOCKING_PANDIT_STATUSES = [
  'pending', 'under_review', 'rejected', 'suspended', 'reupload_required',
];
