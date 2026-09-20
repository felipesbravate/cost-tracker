import { NextResponse } from 'next/server';
import { securityHeaders } from '../../../src/lib/legacy.js';
import { currentUser } from '../../../src/server/auth.js';
import { getDeps, handle } from '../../../src/server/deps.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function run(request) {
  const url = new URL(request.url).pathname; // raw, still percent-encoded; the API decodes and validates ids itself
  let body;
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    const raw = await request.text();
    if (raw.length > 12_000_000) return NextResponse.json({ error: { code: 'too_large', message: 'Too large' } }, { status: 413 });
    if (raw) { try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: { code: 'bad_input', message: 'Invalid JSON' } }, { status: 400 }); } }
  }
  const headers = Object.fromEntries(request.headers);
  const r = await handle({ method: request.method, path: url, headers, body, user: await currentUser() }, getDeps());
  return NextResponse.json(r.body, { status: r.status, headers: securityHeaders() });
}
export { run as GET, run as POST, run as PUT, run as DELETE };
