'use client';
import { useEffect, useRef } from 'react';
import { Button, RoundButton } from './Button.jsx';
import { x } from './icons.js';

// An illustration (src/ui/illustrations.js) at its 64px size, in surface/dark.
export function Illustration({ art, className }) {
  if (!art) return null;
  return (
    <svg className={['ds-illustration', className].filter(Boolean).join(' ')} viewBox={art.viewBox} width="64" height="64" aria-hidden="true" data-illustration={art.name}>
      {art.paths.map((d, i) => <path key={i} d={d} fill="currentColor" />)}
    </svg>
  );
}

// Modal (DS Components 273:632). 540 wide, surface/primary, radius/md, shadow 0 0 8 ink@8%, padding 16/16/24/16, 40 between
// Header (Round button Small Tertiary, X), Content (optional 64px illustration, title Heading/Large, description
// Body/Medium/Medium, centred) and Actions (Secondary + Primary Medium buttons, 240 wide, 16 apart).
// `illustration` = an object from illustrations.js, or null to hide it (the "Illustration" boolean).
// Opens as a native <dialog> (focus trap, Escape closes, page behind inert).
export function Modal({ open, onClose, title, description, illustration, primary, secondary, id, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const titleId = id ? `${id}-title` : undefined;
  return (
    <dialog ref={ref} className="ds-modal" id={id} aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); onClose && onClose(); }}
      onClick={(e) => { if (e.target === ref.current && onClose) onClose(); }}>
      <div className="ds-modal-header"><RoundButton icon={x} size="small" label="Close" onClick={onClose} /></div>
      <div className="ds-modal-content">
        <div className="ds-modal-title-block">
          <Illustration art={illustration} />
          <h2 className="ds-modal-title" id={titleId}>{title}</h2>
        </div>
        {description && <p className="ds-modal-description">{description}</p>}
        {children}
      </div>
      {(primary || secondary) && (
        <div className="ds-modal-actions">
          {secondary && <Button variant="secondary" onClick={secondary.onClick} disabled={secondary.disabled} id={secondary.id}>{secondary.label}</Button>}
          {primary && <Button onClick={primary.onClick} disabled={primary.disabled} id={primary.id}>{primary.label}</Button>}
        </div>
      )}
    </dialog>
  );
}
