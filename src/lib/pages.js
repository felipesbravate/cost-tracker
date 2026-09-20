// @ts-check
// Tiny server-rendered pages (no client JavaScript at all, so a strict CSP with no inline script works).
const esc = (/** @type {string} */ s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);
const shell = (/** @type {string} */ title, /** @type {string} */ body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><link rel="icon" href="data:,"><title>${esc(title)}</title><style>body{font:16px/1.5 system-ui,sans-serif;background:#f9f9f7;color:#1b1a17;margin:0;display:grid;place-items:center;min-height:100vh}main{background:#fff;border:1px solid #cbcac5;border-radius:24px;padding:32px;max-width:420px;width:calc(100% - 32px)}h1{font-size:24px;margin:0 0 8px}p{color:#58554b}input,button{font:inherit;padding:12px 16px;border-radius:12px;border:1px solid #cbcac5;width:100%;box-sizing:border-box;margin-top:12px}button{background:#1b1a17;color:#fff;cursor:pointer;border-color:#1b1a17}.msg{color:#58554b;background:#eef0ee;padding:8px 12px;border-radius:12px}</style></head><body><main>${body}</main></body></html>`;

/** @param {{ message?: string }} [o] */
export function loginHtml(o = {}) {
  return shell('Sign in', `<h1>Cost tracker</h1><p>Enter your email and we will send you a sign-in link. New accounts must be approved by an administrator before they can use the tracker.</p>${o.message ? `<p class="msg" role="status">${esc(o.message)}</p>` : ''}<form method="post" action="/auth/login"><input name="email" type="email" required autocomplete="email" placeholder="you@example.com"><button type="submit">Send sign-in link</button></form>`);
}
export function pendingHtml() {
  return shell('Waiting for approval', `<h1>Waiting for approval</h1><p>Your account exists, but an administrator has to approve it before you can use the tracker. Try again later.</p><form method="post" action="/auth/signout"><button type="submit">Sign out</button></form>`);
}
export function blockedHtml() {
  return shell('Account blocked', `<h1>Account blocked</h1><p>This account can't use the tracker.</p><form method="post" action="/auth/signout"><button type="submit">Sign out</button></form>`);
}
