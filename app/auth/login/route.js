import { passesFormCsrf } from '../../../src/lib/security.js';
import { authClient } from '../../../src/server/auth.js';
import { getDeps } from '../../../src/server/deps.js';

export const dynamic = 'force-dynamic';
const back = (path) => new Response(null, { status: 303, headers: { location: path } });

export async function POST(request) {
  const deps = getDeps();
  if (!passesFormCsrf({ method: 'POST', headers: Object.fromEntries(request.headers) }, deps.appOrigin)) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const email = String(form.get('email') || '').trim().toLowerCase().slice(0, 254);
  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  // Same response whether or not the address exists or the request was throttled: no account enumeration.
  if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && deps.loginLimiter.take(`ip:${ip}`) && deps.loginLimiter.take(`em:${email}`)) {
    const sb = await authClient();
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${deps.appOrigin}/auth/callback`, shouldCreateUser: true } });
    // Shown only in the server log, never to the visitor (same response either way).
    if (error) console.error('[login] sign-in email failed:', error.status, error.message);
    else console.log('[login] sign-in email requested');
  }
  return back('/login?sent=1');
}
