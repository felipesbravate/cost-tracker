import { cookies } from 'next/headers';
import { passesFormCsrf } from '../../../src/lib/security.js';
import { authClient } from '../../../src/server/auth.js';
import { getDeps } from '../../../src/server/deps.js';
import { EMAIL_COOKIE, LOGIN_CTX_COOKIE, LOGIN_NAME_COOKIE, cleanEmail, cleanName, emailCookieOptions, encodeCtx, greetingName } from '../../../src/lib/otp-login.js';

export const dynamic = 'force-dynamic';
const back = (path) => new Response(null, { status: 303, headers: { location: path } });

// "Create account" (Ongatu 342:7702): the name is kept until the code is checked (/auth/verify saves it on the new
// account). The code was already emailed at step 1; if the address was changed here, a code goes to the new one.
export async function POST(request) {
  const deps = getDeps();
  if (!passesFormCsrf({ method: 'POST', headers: Object.fromEntries(request.headers) }, deps.appOrigin)) return new Response('Forbidden', { status: 403 });
  const store = await cookies();
  const before = cleanEmail(store.get(EMAIL_COOKIE)?.value);
  if (!before) return back('/login');
  const form = await request.formData();
  const name = cleanName(form.get('name'));
  const email = cleanEmail(form.get('email'));
  if (!name) return back('/login?step=new&error=name');
  if (!email) return back('/login?step=new&error=email');
  const secure = deps.appOrigin.startsWith('https:');
  if (email !== before) {
    const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
    if (!deps.loginLimiter.take(`ip:${ip}`) || !deps.loginLimiter.take(`em:${email}`)) return back('/login?step=new&error=limit');
    const who = await deps.accounts.lookup(email).catch(() => ({ exists: true }));
    const sb = await authClient();
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: !who.exists } });
    if (error) console.error('[signup] sign-in email failed:', error.status, error.message);
    store.set(EMAIL_COOKIE, email, emailCookieOptions(secure));
  }
  store.set(LOGIN_NAME_COOKIE, encodeURIComponent(name), emailCookieOptions(secure));
  store.set(LOGIN_CTX_COOKIE, encodeCtx({ k: 'new', n: greetingName(name, email) }), emailCookieOptions(secure));
  return back('/login?step=code');
}
