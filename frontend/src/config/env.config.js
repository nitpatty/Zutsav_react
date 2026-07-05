// Single place that reads `process.env.REACT_APP_*`. CRA inlines these at
// build time, so the only way to change them per deployment is to set them
// before `npm run build` (see ../../Dockerfile and DEPLOYMENT_CONFIGURATION.md).
export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
export const WEB_URL = process.env.REACT_APP_WEB_URL || 'http://localhost:3000';
export const ADMIN_URL = process.env.REACT_APP_ADMIN_URL || WEB_URL;
export const CLARITY_PROJECT_ID = process.env.REACT_APP_MICROSOFT_CLARITY_PROJECT_ID || '';
