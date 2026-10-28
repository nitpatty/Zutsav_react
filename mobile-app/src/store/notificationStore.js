import { create } from 'zustand';
import api from '../api/axios';
import { saveCache, loadCache } from '../utils/offlineCache';
import { useLanguageStore } from '../i18n/languageStore';

// Bumped by reset() (logout / session expiry). Fetches that were already in
// flight for the previous account compare against it and drop their result, so
// they can neither repopulate the store nor re-write the offline cache.
let epoch = 0;

export const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount:   0,
  loading:       false,

  // In-memory only (the cache entry is cleared by utils/sessionCleanup). Sync + idempotent.
  reset: () => { epoch += 1; set({ notifications: [], unreadCount: 0, loading: false }); },

  fetch: async () => {
    const myEpoch = epoch;
    // Show last-known notifications immediately if the store is currently
    // empty (e.g. fresh app launch while offline) — never overwrites
    // already-fresher in-memory state on a normal re-fetch.
    if (get().notifications.length === 0) {
      const cached = await loadCache('notifications');
      if (cached && myEpoch === epoch) set({ notifications: cached.data });
    }
    if (myEpoch !== epoch) return;
    set({ loading: true });
    try {
      const { data } = await api.get('/notifications?limit=50');
      if (myEpoch !== epoch) return;
      set({ notifications: data.notifications || [], loading: false });
      saveCache('notifications', data.notifications || []);
    } catch {
      if (myEpoch === epoch) set({ loading: false });
    }
  },

  fetchUnreadCount: async () => {
    const myEpoch = epoch;
    try {
      const { data } = await api.get('/notifications/unread-count');
      if (myEpoch === epoch) set({ unreadCount: data.count || 0 });
    } catch {}
  },

  markRead: async (id) => {
    await api.patch(`/notifications/${id}/read`);
    set((s) => ({
      notifications: s.notifications.map((n) => n._id === id ? { ...n, isRead: true } : n),
      unreadCount:   Math.max(0, s.unreadCount - 1),
    }));
  },

  markAllRead: async () => {
    await api.patch('/notifications/read-all');
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, isRead: true })),
      unreadCount:   0,
    }));
  },

  addRealtime: (notification) => {
    set((s) => ({
      notifications: [notification, ...s.notifications],
      unreadCount:   s.unreadCount + 1,
    }));
  },

  deleteNotification: async (id) => {
    await api.delete(`/notifications/${id}`);
    set((s) => {
      const wasUnread = s.notifications.find((n) => n._id === id)?.isRead === false;
      return {
        notifications: s.notifications.filter((n) => n._id !== id),
        unreadCount:   wasUnread ? Math.max(0, s.unreadCount - 1) : s.unreadCount,
      };
    });
  },

  clearAll: async () => {
    await api.delete('/notifications/clear-all');
    set({ notifications: [], unreadCount: 0 });
  },
}));

// Notification text is server-translated (GET /notifications?lang=). When the UI language changes, drop the
// previous language's list and invalidate in-flight fetches so a late English response cannot repopulate the store;
// the screen refetches in the new language. Nothing else (unread count, session) is touched.
useLanguageStore.subscribe((state, prev) => {
  if (state.language !== prev.language) {
    epoch += 1;
    useNotificationStore.setState({ notifications: [] });
  }
});
