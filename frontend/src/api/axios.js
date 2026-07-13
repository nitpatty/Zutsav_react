import axios from 'axios';
import toast from 'react-hot-toast';
import { urls } from '../config';
import { readToken, clearAuth } from '../utils/authStorage';

const API = axios.create({
  baseURL: urls.apiUrl,
  withCredentials: true,
});

// Attach JWT token to every request — readToken() checks both localStorage
// (Remember Me) and sessionStorage (session-only), whichever holds it.
API.interceptors.request.use((config) => {
  const token = readToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Global response handler
API.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Clear stale credentials from storage
      clearAuth();
      // Dispatch event so AuthContext handles logout through React state.
      // NEVER use window.location.href here — it causes a hard reload,
      // bypasses React Router, and makes any 401 (including from the AI
      // endpoint) look like the user was "logged out unexpectedly".
      window.dispatchEvent(new CustomEvent('zutsav:unauthorized'));
    }
    if (err.response?.status === 429) {
      toast.error('Server is busy. Please wait a moment and try again.', {
        id: 'rate-limit',
        duration: 5000,
      });
    }
    return Promise.reject(err);
  }
);

export default API;
