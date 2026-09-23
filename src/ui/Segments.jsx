// Segments (DS 30:98) and Sub-segments (69:900): a row of tabs, one pressed.
// options: [{ value, label }]. `sub` renders the smaller tier. Hidden options are skipped.
export function Segments({ options, value, onChange, sub = false, id, className, ...rest }) {
  return (
    <div className={['seg-tabs', sub && 'sub', className].filter(Boolean).join(' ')} id={id} {...rest}>
      {options.map((o) => (
        <button key={o.value} type="button" data-v={o.value} aria-pressed={o.value === value ? 'true' : 'false'} hidden={o.hidden || undefined}
          onClick={() => onChange && onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}
