import { cookies } from 'next/headers';
import { passesFormCsrf } from '../../../src/lib/security.js';
import { authClient } from '../../../src/server/auth.js';
import { getDeps } from '../../../src/server/deps.js';
import { EMAIL_COOKIE, cleanCode, cleanEmail } from '../../../src/lib/otp-login.js';

export const dynamic = 'force-dynamic';
const back = (path) => new Response(null, { status: 303, headers: { location: path } });

// Step 2: check the typed code. Attempts are limited per address and per IP (a 6-digit code must not be
// guessable); Supabase also rate-limits verification on its side.
export async function POST(request) {
  const deps = getDeps();
  if (!passesFormCsrf({ method: 'POST', headers: Object.fromEntries(request.headers) }, deps.appOrigin)) return new Response('Forbidden', { status: 403 });
  const store = await cookies();
  const email = cleanEmail(store.get(EMAIL_COOKIE)?.value);
  if (!email) return back('/login');
  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  if (!deps.verifyLimiter.take(`em:${email}`) || !deps.verifyLimiter.take(`ip:${ip}`)) return back('/login?step=code&error=limit');
  const code = cleanCode((await request.formData()).get('code'));
  if (!code) return back('/login?step=code&error=code');
  const sb = await authClient();
  const { error } = await sb.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error) { console.error('[verify] code rejected:', error.status, error.code || error.message); return back('/login?step=code&error=code'); }
  store.delete(EMAIL_COOKIE);
  return back('/');
}
