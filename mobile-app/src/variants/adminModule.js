// The ONE place the rest of the app reaches the Admin module. This is the real (Admin-enabled / private) implementation
// and the default: nothing outside this file may import AdminNavigator directly.
//
// A later build phase will make the public variant resolve this module to ./adminModule.public.js (an empty stand-in),
// so the Admin screens never enter that bundle. Nothing here selects a variant at runtime, and no flag in this file is a
// security boundary: the backend decides what an account may do.
export { default as AdminNavigator } from '../navigation/AdminNavigator';
export const ADMIN_AVAILABLE = true;
