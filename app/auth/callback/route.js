import { authClient } from '../../../src/server/auth.js';
import { getDeps } from '../../../src/server/deps.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const code = new URL(request.url).searchParams.get('code');
  const origin = getDeps().appOrigin;
  if (code) {
    const sb = await authClient();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return new Response(null, { status: 303, headers: { location: `${origin}/` } });
  }
  return new Response(null, { status: 303, headers: { location: `${origin}/login` } });
}
