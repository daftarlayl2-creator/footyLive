/**
 * Fan accounts: Guest vs registered (Supabase Auth or device-local), profile
 * editing and the verified badge. See lib/auth/store.ts.
 */

export * from './types';
export * from './validation';
export { useAuth } from './useAuth';
export {
  AUTH_SESSION_KEY,
  getAccessToken,
  getAuthProvider,
  getAuthSnapshot,
  signIn,
  signOut,
  signUp,
  subscribeAuth,
  updateProfile,
} from './store';
export { AVATAR_PRESETS, isImageAvatar, presetFor, resizeImageToDataUrl } from './avatar';
