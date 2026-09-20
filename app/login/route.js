import { loginHtml } from '../../src/lib/pages.js';
import { securityHeaders } from '../../src/lib/legacy.js';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  const sent = new URL(request.url).searchParams.get('sent');
  const msg = sent ? 'If that address is valid, a sign-in link is on its way.' : undefined;
  return new Response(loginHtml({ message: msg }), { headers: { 'content-type': 'text/html; charset=utf-8', ...securityHeaders("default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'") } });
}
