'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { checkmark, negativeFilled } from './icons.js';

// Toast (DS 173:6658): Success (Checkmark) / Fail (Negative, filled) / Neutral (no icon), bottom-right, 24px in.
// `action` is an optional trailing control (the year-delete Undo); the DS Toast itself has none.
export function Toast({ type = 'success', visible, id = 'ds-toast', action, children }) {
  const icon = type === 'fail' ? negativeFilled : type === 'neutral' ? null : checkmark;
  return (
    <div id={id} className={`ds-toast ${type}${visible ? ' visible' : ''}`} role="status">
      {icon && <span className="ds-toast-icon"><Icon icon={icon} /></span>}<span>{children}</span>{action}
    </div>
  );
}

// useToast(): [element, show(message, type)]. Hides after 3.2s, like the legacy page.
export function useToast() {
  const [t, setT] = useState(null);
  const [visible, setVisible] = useState(false);
  const timer = useRef(null);
  const show = useCallback((message, type) => {
    clearTimeout(timer.current);
    setVisible(false);
    setT({ message, type: type === 'fail' || type === 'neutral' ? type : 'success', key: Date.now() });
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    timer.current = setTimeout(() => setVisible(false), 3200);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const el = t ? <Toast key={t.key} type={t.type} visible={visible}>{t.message}</Toast> : null;
  return [el, show];
}
