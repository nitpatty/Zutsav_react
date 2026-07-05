import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import api from '../api/axios';

export const useAuthStore = create((set, get) => ({
  user:    null,
  token:   null,
  loading: false,
  ready:   false,   // hydration complete

  hydrate: async () => {
    try {
      const token = await SecureStore.getItemAsync('zutsav_token');
      const raw   = await SecureStore.getItemAsync('zutsav_user');
      if (token && raw) {
        set({ token, user: JSON.parse(raw), ready: true });
      } else {
        set({ ready: true });
      }
    } catch {
      set({ ready: true });
    }
  },

  login: async (emailOrPhone, password) => {
    set({ loading: true });
    try {
      const { data } = await api.post('/auth/login', { emailOrPhone, password });
      if (!data.deletionPending) {
        await SecureStore.setItemAsync('zutsav_token', data.token);
        await SecureStore.setItemAsync('zutsav_user', JSON.stringify(data.user));
        set({ user: data.user, token: data.token, loading: false });
      } else {
        set({ loading: false });
      }
      return data;
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  setSession: async (token, user) => {
    await SecureStore.setItemAsync('zutsav_token', token);
    await SecureStore.setItemAsync('zutsav_user', JSON.stringify(user));
    set({ user, token });
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('zutsav_token');
    await SecureStore.deleteItemAsync('zutsav_user');
    set({ user: null, token: null });
  },

  refreshUser: async () => {
    try {
      const { data } = await api.get('/auth/me');
      await SecureStore.setItemAsync('zutsav_user', JSON.stringify(data.user));
      set({ user: data.user });
      return data.user;
    } catch {
      get().logout();
    }
  },

  updateUser: async (updates) => {
    const { data } = await api.patch('/users/profile', updates);
    await SecureStore.setItemAsync('zutsav_user', JSON.stringify(data.user));
    set({ user: data.user });
    return data.user;
  },

  setUser: (user) => set({ user }),
}));
