import { API_URL, WEB_URL, ADMIN_URL } from './env.config';

// serverOrigin is API_URL with the trailing "/api" stripped — used to build
// image/file URLs served directly from the backend (e.g. `/uploads/...`)
// and as the Socket.IO connection target.
export const serverOrigin = API_URL.replace(/\/api\/?$/, '');

export const apiUrl = API_URL;
export const webUrl = WEB_URL;
export const adminUrl = ADMIN_URL;
export const socketUrl = serverOrigin;
export const supportEmail = process.env.REACT_APP_SUPPORT_EMAIL || 'info@zutsav.com';
