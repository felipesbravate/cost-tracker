import { Icon } from './Icon.jsx';

// Field: uppercase label over a control (Input 71:1093 / Dropdown). `htmlFor` should name the control
// (for a Dropdown, its trigger: `${id}-trigger`).
export function Field({ label, htmlFor, className, id, children, ...rest }) {
  return (
    <div className={['field', className].filter(Boolean).join(' ')} id={id} {...rest}>
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

// Input (DS 71:1093), Size=Medium: 40 high, padding 0 16, radius/sm, border/default, 14px /15.2 -1%. Empty shows the
// placeholder in text/secondary (Regular); Filled is Medium text/primary; Focus turns the border border/focus;
// Disable fills surface/secondary with text/secondary. `icon` = an optional 20px icon before the text (the Disable
// email field shows Lock).
export function Input({ icon, className, ...rest }) {
  return (
    <span className={['ds-input', rest.disabled && 'is-disabled', icon && 'has-icon', className].filter(Boolean).join(' ')}>
      {icon && <Icon icon={icon} size={20} />}
      <input {...rest} />
    </span>
  );
}
