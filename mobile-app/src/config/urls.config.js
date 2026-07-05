import { API_URL, BASE_URL, WEB_URL } from './env';

export const apiUrl = API_URL;
export const baseUrl = BASE_URL;
export const webUrl = WEB_URL;
// Socket.IO runs on the same host as the REST API — same origin as baseUrl.
export const socketUrl = BASE_URL;
