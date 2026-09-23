import { RoundButton } from './Button.jsx';
import { x } from './icons.js';

// Panel header (Add entry 52:3443 / Year budget): the Round close button, a 24px title and a hint.
export function PanelHeader({ title, titleId, hint, hintId, onClose, closeId }) {
  return (
    <div className="add-panel-header">
      <RoundButton icon={x} id={closeId} label="Close" onClick={onClose} />
      <h2 className="add-panel-title" id={titleId}>{title}</h2>
      {hint != null && <div className="add-panel-hint" id={hintId}>{hint}</div>}
    </div>
  );
}
