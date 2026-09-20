import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** Supabase client bound to the request cookies (anon key: it can only run auth calls, the tables are locked). */
export async function authClient() {
  const store = await cookies();
  return createServerClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => { try { for (const { name, value, options } of list) store.set(name, value, options); } catch { /* called from a read-only context */ } },
    },
  });
}

/** Verified user or null. getUser() re-validates the JWT with Supabase; never trust getSession() alone on the server. */
export async function currentUser() {
  const sb = await authClient();
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}
