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

// Input (DS 71:1093). size: 'medium' (default, 48 high, 14px) | 'small' (40, 12px) | 'tiny' (24, 12px). Empty shows the
// placeholder in text/secondary; Filled is Medium text/primary; Focus turns the border border/focus; Disable fills
// surface/secondary with text/secondary. `icon` = an optional icon before the text (20px at Medium, 12px smaller; the
// Disable email field shows Lock).
export function Input({ icon, size = 'medium', className, ...rest }) {
  return (
    <span className={['ds-input', size !== 'medium' && size, rest.disabled && 'is-disabled', icon && 'has-icon', className].filter(Boolean).join(' ')}>
      {icon && <Icon icon={icon} size={size === 'medium' ? 20 : 12} />}
      <input {...rest} />
    </span>
  );
}
