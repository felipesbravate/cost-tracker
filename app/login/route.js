import { cookies } from 'next/headers';
import { codeHtml, loginHtml, passwordHtml } from '../../src/lib/pages.js';
import { securityHeaders } from '../../src/lib/headers.js';
import { EMAIL_COOKIE, cleanEmail } from '../../src/lib/otp-login.js';
export const dynamic = 'force-dynamic';

const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
const page = (html) => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', ...securityHeaders(CSP) } });

export async function GET(request) {
  const q = new URL(request.url).searchParams;
  const store = await cookies();
  if (q.get('restart')) { store.delete(EMAIL_COOKIE); return page(loginHtml()); }
  const email = cleanEmail(store.get(EMAIL_COOKIE)?.value);
  if (q.get('step') === 'code' && email) {
    const msg = q.get('error') === 'code' ? "That code didn't work. Check it, or start again to get a new one (codes expire)."
      : q.get('error') === 'limit' ? 'Too many attempts. Wait a few minutes and start again.' : undefined;
    return page(codeHtml({ email, message: msg }));
  }
  if (q.get('step') === 'password' && email) {
    const msg = q.get('error') === 'password' ? "That password didn't work. Try again, or get a sign-in code instead."
      : q.get('error') === 'limit' ? 'Too many attempts. Wait a few minutes and start again.' : undefined;
    return page(passwordHtml({ email, message: msg }));
  }
  // Old emailed links still land on /auth/callback, which sends failures here with ?error=1.
  const msg = q.get('error') ? 'That sign-in link did not work. Enter your email to get a sign-in code instead.' : undefined;
  return page(loginHtml({ message: msg }));
}
