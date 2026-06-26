import axios from 'axios';
import toast from 'react-hot-toast';

// ✅ ✅ Use environment variable (best practice)
const API = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "https://backend.zutsav.com/api",
  withCredentials: true,
});

// Attach JWT token to every request
// ✅ Attach JWT token to every request
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('zutsav_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Global response handler
API.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Clear stale credentials from storage
      localStorage.removeItem('zutsav_token');
      localStorage.removeItem('zutsav_user');
      // Dispatch event so AuthContext handles logout through React state.
      // NEVER use window.location.href here — it causes a hard reload,
      // bypasses React Router, and makes any 401 (including from the AI
      // endpoint) look like the user was "logged out unexpectedly".
      window.dispatchEvent(new CustomEvent('zutsav:unauthorized'));
// ✅ Global response handling
API.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    // ✅ Handle unauthorized
    if (status === 401) {
      localStorage.removeItem('zutsav_token');
      localStorage.removeItem('zutsav_user');

      window.location.href = '/login';
    }

    // ✅ Handle rate limiting
    if (status === 429) {
      toast.error('Server is busy. Please try again in a few seconds.', {
        id: 'rate-limit',
        duration: 5000,
      });
    }

    // ✅ Handle general errors (optional but helpful)
    if (status >= 500) {
      toast.error('Server error. Please try again later.');
    }

    return Promise.reject(error);
  }
);

export default API;
