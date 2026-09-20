import { authClient } from '../../../src/server/auth.js';
import { getDeps } from '../../../src/server/deps.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const code = params.get('code');
  const origin = getDeps().appOrigin;
  if (code) {
    const sb = await authClient();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return new Response(null, { status: 303, headers: { location: `${origin}/` } });
    console.error('[callback] code exchange failed:', error.status, error.message);
  } else {
    // e.g. error_code=otp_expired when an email scanner already used the link
    console.error('[callback] no code in link:', params.get('error_code') || params.get('error') || 'none');
  }
  return new Response(null, { status: 303, headers: { location: `${origin}/login?error=1` } });
}
