import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { urls } from '../config';

const api = axios.create({
  baseURL: urls.apiUrl,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT from secure storage on every request
api.interceptors.request.use(async (config) => {
  try {
    const token = await SecureStore.getItemAsync('zutsav_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {}
  return config;
});



// Global error normalisation
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Token expired — auth store will catch this on the next navigation cycle
      SecureStore.deleteItemAsync('zutsav_token').catch(() => {});
      SecureStore.deleteItemAsync('zutsav_user').catch(() => {});
    }
    return Promise.reject(err);
  }
);

export const imageUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${urls.baseUrl}/${path}`;
};

export default api;
