import { cookies } from 'next/headers';
import { passesFormCsrf } from '../../../src/lib/security.js';
import { authClient } from '../../../src/server/auth.js';
import { getDeps } from '../../../src/server/deps.js';
import { EMAIL_COOKIE, cleanEmail, emailCookieOptions } from '../../../src/lib/otp-login.js';

export const dynamic = 'force-dynamic';
const back = (path) => new Response(null, { status: 303, headers: { location: path } });

// Step 1: email a one-time code. The response is identical whether or not the address exists or the
// request was throttled (no account enumeration); the address is remembered only in an httpOnly cookie.
export async function POST(request) {
  const deps = getDeps();
  if (!passesFormCsrf({ method: 'POST', headers: Object.fromEntries(request.headers) }, deps.appOrigin)) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const email = cleanEmail(form.get('email'));
  if (!email) return back('/login');
  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  if (deps.loginLimiter.take(`ip:${ip}`) && deps.loginLimiter.take(`em:${email}`)) {
    const sb = await authClient();
    // No emailRedirectTo: the email carries a code ({{ .Token }}), not a link.
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) console.error('[login] sign-in email failed:', error.status, error.message);
    else console.log('[login] sign-in code requested');
  }
  (await cookies()).set(EMAIL_COOKIE, email, emailCookieOptions(deps.appOrigin.startsWith('https:')));
  return back('/login?step=code');
}
