'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { checkmark } from './icons.js';

// Toast (DS 173:6658): Success / Fail / Neutral, bottom-centre, 24px up. Every type draws the checkmark, as in the DS.
export function Toast({ type = 'success', visible, children }) {
  return (
    <div id="ds-toast" className={`ds-toast ${type}${visible ? ' visible' : ''}`}>
      <span className="ds-toast-icon"><Icon icon={checkmark} /></span><span>{children}</span>
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
