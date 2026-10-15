/** Email templates may use /auth/confirm?token_hash={{ .TokenHash }}&type=email. */
export { GET } from '../callback/route';
export const dynamic = 'force-dynamic';
