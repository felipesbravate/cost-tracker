import { Icon } from './Icon.jsx';

const cx = (...c) => c.filter(Boolean).join(' ');

// Button (DS 41:119). variant: primary | secondary | tertiary. size: medium | small | tiny.
// Figma's Secondary is the `ghost` class in CSS.
export function Button({ variant = 'primary', size = 'medium', icon, className, children, type = 'button', ...rest }) {
  return (
    <button type={type} className={cx('btn-pill', variant === 'secondary' && 'ghost', variant === 'tertiary' && 'tertiary', size !== 'medium' && size, className)} {...rest}>
      {icon && <Icon icon={icon} size={size === 'tiny' ? 12 : 20} />}
      {icon ? <span>{children}</span> : children}
    </button>
  );
}

// Round button (DS 52:629). variant: tertiary (default) | secondary | primary. size: medium | small | tiny | micro.
// `active` draws State=Active (a menu it opens is showing). Icon size follows the DS: Medium/Small 20, Tiny 12, Micro 10.
export function RoundButton({ icon, size, variant, active, className, label, type = 'button', ...rest }) {
  return (
    <button type={type} className={cx('round-btn', variant && variant !== 'tertiary' && variant, size && size !== 'medium' && size, active && 'is-active', className)} aria-label={label} {...rest}>
      <Icon icon={icon} size={size === 'micro' ? 10 : size === 'tiny' ? 12 : 20} />
    </button>
  );
}

// Action link (DS 106:3611). size: small (default, 12px) | medium (14px). Optional leading 12px icon.
export function ActionLink({ icon, size, className, children, type = 'button', ...rest }) {
  return (
    <button type={type} className={cx('ds-action-link', size === 'medium' && 'medium', className)} {...rest}>
      {icon && <Icon icon={icon} size={12} />}{children}
    </button>
  );
}
