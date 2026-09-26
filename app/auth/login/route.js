import { cookies } from 'next/headers';
import { passesFormCsrf } from '../../../src/lib/security.js';
import { authClient } from '../../../src/server/auth.js';
import { getDeps } from '../../../src/server/deps.js';
import { EMAIL_COOKIE, LOGIN_CTX_COOKIE, LOGIN_NAME_COOKIE, cleanEmail, emailCookieOptions, encodeCtx, greetingName } from '../../../src/lib/otp-login.js';

export const dynamic = 'force-dynamic';
const back = (path) => new Response(null, { status: 303, headers: { location: path } });

// Step 1 (Ongatu 335:7580): the email decides the next step.
//   - an account that chose a password (Account > Security): the password step (335:7542), no code;
//   - any other account: a code is emailed and the code step greets them (335:7606);
//   - an address with no account: a code is emailed (the account is made with it) and "Create account" asks for a
//     name (342:7702) before the code step (342:7885).
// `send_code` (Forgot the password?, Re-send code) always emails a code and keeps the step's greeting.
// These steps say whether an address has an account and greet it by first name. The product asked for that; lookups
// share the sign-in rate limit per IP, so addresses can't be tried in bulk.
export async function POST(request) {
  const deps = getDeps();
  if (!passesFormCsrf({ method: 'POST', headers: Object.fromEntries(request.headers) }, deps.appOrigin)) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const email = cleanEmail(form.get('email'));
  if (!email) return back('/login?error=email');
  const secure = deps.appOrigin.startsWith('https:');
  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  const store = await cookies();
  const resend = !!form.get('send_code');
  if (!resend && !deps.loginLimiter.take(`ip:${ip}`)) return back('/login?error=limit');
  const who = await deps.accounts.lookup(email).catch(() => ({ exists: true, method: 'code', name: null }));
  const ctx = { k: who.exists ? 'code' : 'new', n: greetingName(who.name, email) };
  store.set(EMAIL_COOKIE, email, emailCookieOptions(secure));
  if (!resend) store.delete(LOGIN_NAME_COOKIE);
  if (who.exists && who.method === 'password' && !resend) {
    store.set(LOGIN_CTX_COOKIE, encodeCtx({ k: 'password', n: ctx.n }), emailCookieOptions(secure));
    return back('/login?step=password');
  }
  if (deps.loginLimiter.take(`em:${email}`)) {
    const sb = await authClient();
    // No emailRedirectTo: the email carries a code ({{ .Token }}), not a link.
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: !who.exists } });
    if (error) console.error('[login] sign-in email failed:', error.status, error.message);
    else console.log('[login] sign-in code requested');
  } else if (resend) {
    return back(`/login?step=code&error=limit`);
  }
  // A re-send from the code step of a new account keeps the "We sent your sign-in code" version of the step.
  const prev = resend ? form.get('from') : null;
  store.set(LOGIN_CTX_COOKIE, encodeCtx(prev === 'new' ? { k: 'new', n: ctx.n } : ctx), emailCookieOptions(secure));
  return back(ctx.k === 'new' && !resend ? '/login?step=new' : `/login?step=code${resend ? '&sent=1' : ''}`);
}
