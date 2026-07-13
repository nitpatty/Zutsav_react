import { create } from 'zustand';
import api from '../api/axios';
import { saveCache, loadCache } from '../utils/offlineCache';

export const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount:   0,
  loading:       false,

  fetch: async () => {
    // Show last-known notifications immediately if the store is currently
    // empty (e.g. fresh app launch while offline) — never overwrites
    // already-fresher in-memory state on a normal re-fetch.
    if (get().notifications.length === 0) {
      const cached = await loadCache('notifications');
      if (cached) set({ notifications: cached.data });
    }
    set({ loading: true });
    try {
      const { data } = await api.get('/notifications?limit=50');
      set({ notifications: data.notifications || [], loading: false });
      saveCache('notifications', data.notifications || []);
    } catch {
      set({ loading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const { data } = await api.get('/notifications/unread-count');
      set({ unreadCount: data.count || 0 });
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
