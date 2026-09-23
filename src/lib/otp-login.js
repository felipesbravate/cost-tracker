// @ts-check
// Sign-in with a one-time code typed on the site (no link to click): link scanners and "opened in
// another browser" can't break it. Step 1 (/auth/login) emails the code and remembers the address in a
// short-lived httpOnly cookie; step 2 (/auth/verify) checks the code with Supabase.

export const EMAIL_COOKIE = 'ct_login_email';
export const EMAIL_COOKIE_MAX_AGE = 15 * 60; // seconds; Supabase codes expire sooner (1 h max)

/** Cookie options for the remembered address. @param {boolean} secure */
export const emailCookieOptions = (secure) => ({ httpOnly: true, secure, sameSite: /** @type {'lax'} */ ('lax'), path: '/', maxAge: EMAIL_COOKIE_MAX_AGE });

/** @param {unknown} v @returns {string|null} normalized email or null */
export function cleanEmail(v) {
  const e = String(v || '').trim().toLowerCase().slice(0, 254);
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
}
/** Digits only (people paste "123 456" or "123-456"); Supabase codes are 6 to 10 digits. @param {unknown} v */
export function cleanCode(v) {
  const c = String(v || '').replace(/[\s-]/g, '');
  return /^\d{6,10}$/.test(c) ? c : null;
}
