import { Icon } from './Icon.jsx';
import { x } from './icons.js';
import { Money } from './Money.jsx';

// Entry counter (DS 146:5252): the small dark pill after an item's name. `open` = Pressed (its tooltip is showing).
// variant: undefined | 'estimate' (grey) | 'removed' (red). `children` is the count or a sign (≈, ×, •).
export function EntryCounter({ variant, open, className, children, ...rest }) {
  const cls = ['note-count', variant === 'estimate' && 'is-estimate', variant === 'removed' && 'is-removed', open && 'is-open', className].filter(Boolean).join(' ');
  return <span className={cls} {...rest}>{children}</span>;
}

// Tooltip entry item (DS 144:4426): dot, name + date, then the amount and an optional remove button.
export function TooltipEntryItem({ name, date, amount, currency, estimate, prefix, onRemove, removeTitle, extra, sub }) {
  return (
    <div className={'tip-item' + (sub ? ' sub' : '')}>
      <span className="tip-dot" />
      <span className="tip-left"><span className="tip-name">{name}</span>{date ? <span className="tip-date">{date}</span> : null}</span>
      <span className="tip-right">
        {amount != null && <span className={'tip-amount' + (estimate ? ' is-estimate' : '')}>{prefix || ''}<Money value={amount} currency={currency} /></span>}
        {extra}
        {onRemove && (
          <button type="button" className="round-btn micro tip-del" title={removeTitle} onClick={(e) => { e.stopPropagation(); onRemove(); }}>
            <Icon icon={x} size={10} />
          </button>
        )}
      </span>
    </div>
  );
}

// Entries tooltip (the Entry counter's Pressed state): dark surface listing the entries behind a figure.
export function EntriesTooltip({ visible, style, footnote, children, tipRef }) {
  return (
    <div id="note-tip" ref={tipRef} className={visible ? 'visible' : undefined} style={style}>
      {children}
      {footnote && <div className="tip-foot">{footnote}</div>}
    </div>
  );
}
