// Dependency-free local server that runs the SAME api/vault/CSP code as production, with
// in-memory storage and a fake sign-in (pick any email). For development and e2e tests only.
// It refuses to start when NODE_ENV=production.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle, memoryProfiles, memoryUsage, pageAccess } from '../src/lib/api.js';
import { Vault, memoryStores } from '../src/lib/vault.js';
import { RateLimiter, parseAdminEmails } from '../src/lib/security.js';
import { newNonce, renderTracker, securityHeaders, trackerCsp } from '../src/lib/legacy.js';

if (process.env.NODE_ENV === 'production') { console.error('mock server must not run in production'); process.exit(1); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 3100);
const ORIGIN = process.env.APP_ORIGIN || `http://127.0.0.1:${PORT}`;
const stores = memoryStores();
export const state = { aiCalls: [], stores };
const deps = {
  vault: new Vault({ master: { active: 'v1', keys: { v1: randomBytes(32) } }, keys: stores.keys, docs: stores.docs }),
  profiles: memoryProfiles(), usage: memoryUsage(),
  ai: { async complete(a) { state.aiCalls.push(a); if (a.prompt.includes('CERTAIN SHOP')) return '[{"type":"expense","group":"Variable","category":"Food","item":"Groceries","certainty":"sure","description":"Mock certain shop","amount":23.4,"date":"2026-09-01"}]'; return process.env.MOCK_AI_REPLY || '[{"type":"expense","group":"Variable","category":"Food","item":"Groceries","description":"Mock supermarket","amount":23.4,"date":"2026-09-01"}]'; } },
  admins: parseAdminEmails(process.env.ADMIN_EMAILS || 'admin@example.com'),
  appOrigin: ORIGIN, limiter: new RateLimiter(60, 60_000), dailyReadCap: Number(process.env.DAILY_READ_CAP || 50),
};
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };
const cookieUser = (h) => { const m = /(?:^|; )mock_user=([^;]+)/.exec(h.cookie || ''); if (!m) return null; const email = decodeURIComponent(m[1]).toLowerCase(); return { id: 'u-' + Buffer.from(email).toString('hex').slice(0, 24), email }; };
const readBody = (req) => new Promise((res, rej) => { const c = []; let n = 0; req.on('data', (d) => { n += d.length; if (n > 12e6) { rej(new Error('too big')); req.destroy(); } else c.push(d); }); req.on('end', () => res(Buffer.concat(c).toString('utf8'))); req.on('error', rej); });
const send = (res, status, body, headers = {}) => { res.writeHead(status, { ...securityHeaders(), ...headers }); res.end(body); };

export const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, ORIGIN); const path = url.pathname; const user = cookieUser(req.headers);
    if (path.startsWith('/api/')) {
      let body; const raw = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : '';
      if (raw) { try { body = JSON.parse(raw); } catch { return send(res, 400, '{"error":{"code":"bad_input","message":"Invalid JSON"}}', { 'content-type': 'application/json' }); } }
      const r = await handle({ method: req.method, path, headers: req.headers, body, user }, deps);
      return send(res, r.status, JSON.stringify(r.body), { 'content-type': 'application/json' });
    }
    if (path === '/auth/signout' && req.method === 'POST') return send(res, 200, '{}', { 'content-type': 'application/json', 'set-cookie': 'mock_user=; Path=/; Max-Age=0' });
    if (path === '/login') {
      if (req.method === 'POST') { const email = new URLSearchParams(await readBody(req)).get('email') || ''; return send(res, 303, '', { location: '/', 'set-cookie': `mock_user=${encodeURIComponent(email)}; Path=/; HttpOnly; SameSite=Lax` }); }
      return send(res, 200, '<!doctype html><link rel="icon" href="data:,"><title>Sign in</title><form method="post" action="/login"><label>Email <input name="email" type="email" required></label> <button>Sign in (mock)</button></form>', { 'content-type': 'text/html' });
    }
    if (path === '/pending') return send(res, 200, '<!doctype html><link rel="icon" href="data:,"><title>Pending</title><h1>Waiting for approval</h1><p>An administrator has to approve your account before you can use the tracker.</p>', { 'content-type': 'text/html' });
    if (path === '/') {
      const access = await pageAccess(user, deps);
      if (access === 'login') return send(res, 303, '', { location: '/login' });
      if (access !== 'ok') return send(res, 303, '', { location: '/pending' });
      const nonce = newNonce();
      return send(res, 200, renderTracker(nonce), { 'content-type': 'text/html; charset=utf-8', ...securityHeaders(trackerCsp(nonce)) });
    }
    if (path === '/__test/state' && process.env.MOCK_TEST_ENDPOINTS === '1') {
      return send(res, 200, JSON.stringify({ aiCalls: state.aiCalls.map((c) => ({ prompt: c.prompt.slice(0, 4000), images: (c.images || []).length })), rows: [...stores.docMap.values()], keys: [...stores.keyMap.keys()] }), { 'content-type': 'application/json' });
    }
    const file = normalize(join(root, 'public', path));
    if (!file.startsWith(join(root, 'public') + '/')) return send(res, 404, 'Not found');
    try { return send(res, 200, await readFile(file), { 'content-type': MIME[extname(file)] || 'application/octet-stream' }); }
    catch { return send(res, 404, 'Not found'); }
  } catch (e) { console.error(e); send(res, 500, 'error'); }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) server.listen(PORT, '127.0.0.1', () => console.log(`mock server on ${ORIGIN} (admin: ${[...deps.admins].join(', ')})`));
