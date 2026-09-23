'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, Dropdown, MonthSelector, RoundButton, YearAddButton } from '../ui/index.js';
import { x } from '../ui/icons.js';
import { Icon } from '../ui/Icon.jsx';

// Year tabs (newest first) with "+ Add year", and the month row (Nav tabs 59:850, Month selector 4:171).
export function YearNav({ model, yearIdx, monthIdx, onYear, onMonth, onAddYear, onDeleteYear, canSave }) {
  const { DATA } = model;
  const y = DATA[yearIdx];
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState(null); // label of the year asking "Delete?"
  // Any data change redraws the tabs, which drops an open "Delete?" (as on the legacy page).
  useEffect(() => { setConfirm(null); }, [model]);

  return (
    <div className="actions-wrap">
      <div className={'actions-row' + (adding ? ' dimmed' : '')}>
        <div className="top-nav">
          <div className="years">
            <YearAddButton id="year-add-toggle" onClick={() => setAdding((a) => !a)} />
            <div className="year-tabs" id="years" role="tablist" aria-label="Year">
              {DATA.map((_, i) => i).reverse().map((i) => {
                const yr = DATA[i];
                if (confirm === yr.year) {
                  return (
                    <div className="year-tab" key={yr.year}>
                      <div className="year-confirm">
                        <span>{`Delete ${yr.year}?`}</span>
                        <Button size="tiny" className="yc-yes" onClick={(e) => { e.stopPropagation(); onDeleteYear(yr); }}>Yes</Button>
                        <Button size="tiny" variant="secondary" className="yc-cancel" onClick={(e) => { e.stopPropagation(); setConfirm(null); }}>Cancel</Button>
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="year-tab" key={yr.year}>
                    <button className="year-btn" role="tab" aria-pressed={i === yearIdx ? 'true' : 'false'} onClick={() => onYear(i)}>{yr.year}</button>
                    {yr.isExtra && yr.dbId && i === yearIdx && (
                      <button type="button" className="year-del-btn" aria-label={'Delete ' + yr.year} onClick={(e) => { e.stopPropagation(); setConfirm(yr.year); }}>
                        <Icon icon={x} size={10} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="months" id="months" role="tablist" aria-label="Month">
            {y.months.map((m, i) => {
              const future = model.isFutureMonth(y, i);
              const has = !future && model.monthHasData(y, i);
              return <MonthSelector key={m} label={m.slice(0, 3)} selected={i === monthIdx} state={future ? 'estimated' : has ? undefined : 'empty'} onSelect={() => onMonth(i)} />;
            })}
          </div>
        </div>
      </div>
      <AddYearPill open={adding} onClose={() => setAdding(false)} model={model} canSave={canSave}
        onSubmit={(label, currency) => { setAdding(false); onAddYear(label, currency); }} />
    </div>
  );
}

// Nav tabs - Add year (79:1242): close, year, currency, "Add year". It only validates; the Year budget panel creates the year.
function AddYearPill({ open, onClose, onSubmit, model, canSave }) {
  const [label, setLabel] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [status, setStatus] = useState(canSave ? null : { err: true, text: "This view can't save a new year (no database access)." });
  const input = useRef(null);
  useEffect(() => { if (open) { setLabel(''); setStatus(null); input.current?.focus(); } }, [open]);
  const submit = () => {
    const l = label.trim();
    if (!l) return setStatus({ err: true, text: 'Enter a year.' });
    if (model.DATA.some((y) => y.year === l)) return setStatus({ err: true, text: 'That year already exists.' });
    if (!canSave) return setStatus({ err: true, text: "Not connected — can't save a new year right now." });
    onSubmit(l, currency);
  };
  return (
    <div className={'year-add-pill' + (open ? ' open' : '')} id="year-add-panel" role="dialog" aria-label="Add a year">
      <RoundButton icon={x} id="year-add-cancel" label="Close" onClick={onClose} />
      <div className="year-add-pill-inputs">
        <div className="year-add-pill-field">
          <input ref={input} type="text" id="year-add-input" placeholder="2027" inputMode="numeric" aria-label="Year" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="year-add-pill-currency">
          <Dropdown id="year-add-currency" ariaLabel="Currency" size="sm" value={currency} onChange={setCurrency} emptyOption={false}
            options={[{ value: 'EUR', label: 'EUR' }, { value: 'SEK', label: 'SEK' }]} />
        </div>
      </div>
      <button className="btn-pill" id="year-add-submit" onClick={submit}>Add year</button>
      <span className={'add-status' + (status && status.err ? ' err' : '')} id="year-add-status">{status ? status.text : ''}</span>
    </div>
  );
}
