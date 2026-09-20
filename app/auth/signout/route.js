import { passesCsrf, passesFormCsrf } from '../../../src/lib/security.js';
import { authClient } from '../../../src/server/auth.js';
import { getDeps } from '../../../src/server/deps.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const deps = getDeps();
  const headers = Object.fromEntries(request.headers);
  const viaFetch = headers['x-requested-with'] === 'costs-tracker';
  const ok = viaFetch ? passesCsrf({ method: 'POST', headers }, deps.appOrigin) : passesFormCsrf({ method: 'POST', headers }, deps.appOrigin);
  if (!ok) return new Response('Forbidden', { status: 403 });
  const sb = await authClient();
  await sb.auth.signOut();
  return viaFetch ? Response.json({}) : new Response(null, { status: 303, headers: { location: '/login' } });
}
