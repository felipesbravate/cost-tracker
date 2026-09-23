// Money formatting, European style (1.234,56). Same output as the legacy tracker.
const sym = (cur) => (cur === 'EUR' ? '€' : cur === 'SEK' ? 'kr' : cur);
const de = (v, digits) => Math.abs(v).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** "€1.234,56" (EUR) or "1.234,56 kr" (others). */
export function fmtMoney(v, cur) {
  const s = de(v, 2);
  return (v < 0 ? '-' : '') + (cur === 'EUR' ? `${sym(cur)}${s}` : `${s} ${sym(cur)}`);
}
/** Rounded to whole units: "€1.235". */
export function fmtMoneyShort(v, cur) {
  const s = Math.round(Math.abs(v)).toLocaleString('de-DE');
  return (v < 0 ? '-' : '') + (cur === 'EUR' ? `${sym(cur)}${s}` : `${s} ${sym(cur)}`);
}
/** Just the figure, no symbol: "1.234,56". */
export const fmtFigure = (v) => de(v, 2);
