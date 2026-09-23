// Icon (DS Icons page 85:1268). Pass an icon object from ./icons.js; `size` picks the drawing redrawn for
// 10 or 12px when the set has one (X, Euro, Dollar). The rendered size itself comes from CSS, as in the DS.
export function Icon({ icon, size, ...rest }) {
  if (!icon) return null;
  const own = size && icon.sizes && icon.sizes[size];
  const ic = own ? { ...icon, ...own } : icon;
  // data-icon names the glyph, so tests and tools can tell which icon is drawn without comparing paths.
  const common = { viewBox: ic.viewBox, xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': 'true', 'data-icon': icon.name, ...rest };
  if (ic.type === 'dots') {
    return <svg {...common}>{ic.circles.map((c, i) => <circle key={i} cx={c.cx} cy={c.cy} r={c.r} fill="currentColor" />)}</svg>;
  }
  if (ic.type === 'stroke-only') {
    return <svg {...common}>{ic.strokes.map((s, i) => <path key={i} d={s.d} fill="none" stroke="currentColor" strokeWidth={s.w} strokeLinecap={s.cap} strokeLinejoin="round" />)}</svg>;
  }
  if (ic.type === 'mixed') {
    return (
      <svg {...common}>
        <path d={ic.fillD} fill="currentColor" fillRule={ic.fillRule} />
        {ic.strokes.map((s, i) => <path key={i} d={s.d} fill="none" stroke="currentColor" strokeWidth={s.w} strokeLinecap={(s.cap || 'round').toLowerCase()} strokeLinejoin="round" />)}
      </svg>
    );
  }
  return <svg {...common} fill="currentColor"><path fillRule={ic.fillRule} d={ic.d} /></svg>;
}
