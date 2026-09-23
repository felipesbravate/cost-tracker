// Content-Security-Policy with a per-request nonce for the React pages. Next reads the nonce from this header
// and puts it on its own scripts; nothing else can run. Mirrors trackerCsp() in src/lib/legacy.js.
import { NextResponse } from 'next/server';

export function middleware(request) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== 'production';
  const csp = [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' data: blob:",
    `connect-src 'self'${dev ? ' ws:' : ''}`,
    "worker-src 'self' blob:",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  const reqHeaders = new Headers(request.headers);
  reqHeaders.set('x-nonce', nonce);
  reqHeaders.set('content-security-policy', csp);
  const res = NextResponse.next({ request: { headers: reqHeaders } });
  res.headers.set('content-security-policy', csp);
  res.headers.set('cache-control', 'no-store');
  return res;
}

export const config = { matcher: ['/v2', '/v2/:path*'] };
