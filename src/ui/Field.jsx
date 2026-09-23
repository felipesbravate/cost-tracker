// Field: uppercase label over a control (Input 71:1093 / Dropdown). `htmlFor` should name the control
// (for a Dropdown, its trigger: `${id}-trigger`).
export function Field({ label, htmlFor, className, id, children }) {
  return (
    <div className={['field', className].filter(Boolean).join(' ')} id={id}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

// Group label + control stack (the "Type" controller in the panels).
export function FieldGroup({ label, className, children }) {
  return (
    <div className={['field-group', className].filter(Boolean).join(' ')}>
      <div className="field-label">{label}</div>
      {children}
    </div>
  );
}
