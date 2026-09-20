import { pageAccess } from '../src/lib/api.js';
import { blockedHtml, pendingHtml } from '../src/lib/pages.js';
import { newNonce, renderTracker, securityHeaders, trackerCsp } from '../src/lib/legacy.js';
import { currentUser } from '../src/server/auth.js';
import { getDeps } from '../src/server/deps.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const html = (body, csp) => new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8', ...securityHeaders(csp || "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'") } });

export async function GET() {
  const access = await pageAccess(await currentUser(), getDeps());
  if (access === 'login') return new Response(null, { status: 303, headers: { location: '/login' } });
  if (access === 'pending') return html(pendingHtml());
  if (access === 'blocked') return html(blockedHtml());
  const nonce = newNonce();
  return html(renderTracker(nonce), trackerCsp(nonce));
}
