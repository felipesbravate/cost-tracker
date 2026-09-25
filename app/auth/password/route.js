import { cookies } from 'next/headers';
import { passesFormCsrf } from '../../../src/lib/security.js';
import { authClient } from '../../../src/server/auth.js';
import { getDeps } from '../../../src/server/deps.js';
import { EMAIL_COOKIE, cleanEmail } from '../../../src/lib/otp-login.js';

export const dynamic = 'force-dynamic';
const back = (path) => new Response(null, { status: 303, headers: { location: path } });

// Password sign-in, for accounts that chose a password in Account > Security. Attempts are limited per address and
// per IP, like codes; Supabase rate-limits on its side too.
export async function POST(request) {
  const deps = getDeps();
  if (!passesFormCsrf({ method: 'POST', headers: Object.fromEntries(request.headers) }, deps.appOrigin)) return new Response('Forbidden', { status: 403 });
  const store = await cookies();
  const email = cleanEmail(store.get(EMAIL_COOKIE)?.value);
  if (!email) return back('/login');
  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  if (!deps.verifyLimiter.take(`em:${email}`) || !deps.verifyLimiter.take(`ip:${ip}`)) return back('/login?step=password&error=limit');
  const password = String((await request.formData()).get('password') || '');
  if (!password || password.length > 200) return back('/login?step=password&error=password');
  const sb = await authClient();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { console.error('[password] rejected:', error.status, error.code || error.message); return back('/login?step=password&error=password'); }
  store.delete(EMAIL_COOKIE);
  return back('/');
}
