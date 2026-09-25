// Accounts on Supabase auth (service role, server-only): the sign-in method lives in the user's app_metadata
// (sign_in: 'code' | 'password'; only the service role can write it), passwords are Supabase's own.
// Switching back to codes replaces the password with a random one, so the old password stops working.
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const methodOf = (user) => (user && user.app_metadata && user.app_metadata.sign_in === 'password' ? 'password' : 'code');
const must = ({ data, error }) => { if (error) throw new Error(`auth: ${error.message}`); return data; };

/** @param {any} admin supabase-js client with the service-role key @param {{url:string, anonKey:string, profiles:any}} o */
export function supabaseAccounts(admin, { url, anonKey, profiles }) {
  return {
    async getMethod(u) { return methodOf(must(await admin.auth.admin.getUserById(u.id)).user); },
    async methodForEmail(email) {
      const p = await profiles.byEmail(email);
      if (!p) return 'code';
      const r = await admin.auth.admin.getUserById(p.user_id);
      return r.error ? 'code' : methodOf(r.data.user);
    },
    async setPassword(u, password) { must(await admin.auth.admin.updateUserById(u.id, { password, app_metadata: { sign_in: 'password' } })); },
    // A throwaway client (no cookies, no stored session): only answers "is this the password".
    async checkPassword(email, password) {
      const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await c.auth.signInWithPassword({ email, password });
      return !error;
    },
    async useCode(u) { must(await admin.auth.admin.updateUserById(u.id, { password: randomBytes(32).toString('base64url'), app_metadata: { sign_in: 'code' } })); },
    // Deleting the auth user cascades to profiles, user_keys and documents (0001_init.sql).
    async deleteUser(u) { must(await admin.auth.admin.deleteUser(u.id)); },
  };
}
