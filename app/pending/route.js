import { pendingHtml } from '../../src/lib/pages.js';
import { securityHeaders } from '../../src/lib/headers.js';
export const dynamic = 'force-dynamic';
export async function GET() {
  return new Response(pendingHtml(), { headers: { 'content-type': 'text/html; charset=utf-8', ...securityHeaders("default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'") } });
}
