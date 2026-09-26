// @ts-check
// Names for greetings (no Node-only APIs: the tracker's client code imports this too).

/** A typed full name: trimmed, single spaces, at most 80 characters, no control characters. @param {unknown} v */
export function cleanName(v) {
  // eslint-disable-next-line no-control-regex
  const n = String(v || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return n || null;
}
/** The part of an address before the first dot, digit or plus, capitalised ("felipe.s@x" -> "Felipe"). @param {unknown} email */
export function firstNameOf(email) {
  const part = String(email || '').split('@')[0].split(/[._+\-\d]/).find(Boolean) || '';
  return part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : 'there';
}
/** First word of a full name, else from the address. @param {unknown} full @param {unknown} email */
export const greetingName = (full, email) => (cleanName(full) || '').split(' ')[0] || firstNameOf(email);
