'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ActionLink, Button, FieldGroup, PanelHeader, Segments } from '../ui/index.js';
import { Icon } from '../ui/Icon.jsx';
import { actions as actionsIcon, checkmark, plus, trash, x } from '../ui/icons.js';
import { EXP_GROUPS, fmtNum, parseAmount } from './model.js';

const TYPES = [{ value: 'income', label: 'Income' }, { value: 'investment', label: 'Savings/Investments' }, { value: 'expense', label: 'Expenses' }];
const GROUP_TABS = ['Fixed', 'Variable', 'Additional', 'Extra'].map((g) => ({ value: g, label: g }));
const COMBOS = [{ type: 'income', group: null, label: 'Income' }, { type: 'investment', group: null, label: 'Savings/Investments' }, ...EXP_GROUPS.map((g) => ({ type: 'expense', group: g, label: g }))];
let seq = 0;

// Year budget panel: "{year} / Starting budget". Proposes a monthly figure per item from the trailing 12 months;
// "Create year" writes the year, one budget doc per item, and remembers edited figures as future suggestions.
export function BudgetPanel({ pending, model, onClose, onCreate }) {
  const open = !!pending;
  const [topTab, setTopTab] = useState('expense');
  const [group, setGroup] = useState('Fixed');
  const [sections, setSections] = useState([]);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(null); // { rowKey, anchor }

  // Every section is built once per opening, so an edit in one survives switching tabs.
  useEffect(() => {
    if (!open) { setMenu(null); return; }
    setTopTab('expense'); setGroup('Fixed'); setStatus(null);
    const sugg = model.buildBudgetSuggestions();
    setSections(COMBOS.map(({ type, group: g, label }) => {
      const sec = sugg.find((s) => s.type === type && (type !== 'expense' || s.group === g));
      const row = (it) => ({ key: ++seq, ...it, value: fmtNum(it.suggested != null ? it.suggested : 0) });
      const items = sec ? sec.items : [];
      const blocks = [];
      if (type === 'expense') {
        const byCat = new Map();
        items.forEach((it) => { const k = it.category || '(uncategorized)'; if (!byCat.has(k)) byCat.set(k, []); byCat.get(k).push(row(it)); });
        [...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([category, rows]) => blocks.push({ category, rows }));
      }
      return { type, group: g, label, pre: [], rows: type === 'expense' ? [] : items.map(row), blocks, empty: !items.length, adding: false };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const patchSection = (i, fn) => setSections((ss) => ss.map((s, k) => (k === i ? fn(s) : s)));
  const mapRows = (fn) => setSections((ss) => ss.map((s) => ({ ...s, pre: fn(s.pre), rows: fn(s.rows), blocks: s.blocks.map((b) => ({ ...b, rows: fn(b.rows) })) })));
  const setValue = (key, value) => mapRows((rows) => rows.map((r) => (r.key === key ? { ...r, value } : r)));
  const removeRow = (key) => mapRows((rows) => rows.filter((r) => r.key !== key));
  const allRows = () => sections.flatMap((s) => [...s.pre, ...s.rows, ...s.blocks.flatMap((b) => b.rows)]);

  const create = async () => {
    setStatus(null);
    setBusy(true);
    try { await onCreate(allRows()); } catch (err) { setStatus({ err: true, text: 'Could not save: ' + (err && err.message ? err.message : 'unknown error') }); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className={'add-panel-backdrop' + (open ? ' open' : '')} id="budget-panel-backdrop" onClick={onClose} />
      <div className={'add-panel budget-panel' + (open ? ' open' : '')} id="budget-panel" role="dialog" aria-modal="true" aria-labelledby="budget-panel-title">
        <PanelHeader closeId="budget-close-btn" titleId="budget-panel-title" title={pending ? `${pending.label} / Starting budget` : 'Starting budget'} hintId="budget-panel-hint"
          hint="Suggested from the trailing 12 months of real history. The same figure is used for every month of the new year. Adjust anything before creating it; an edit here also becomes the default suggestion for future years." onClose={onClose} />
        <div className="add-panel-content">
          <FieldGroup label="Type">
            <Segments id="budget-type-seg" options={TYPES} value={topTab} onChange={setTopTab} />
            <div id="budget-group-field" hidden={topTab !== 'expense'}>
              <Segments sub id="budget-group-seg" aria-label="Expense type" options={GROUP_TABS} value={group} onChange={setGroup} />
            </div>
          </FieldGroup>
          <div id="budget-sections">
            {sections.map((s, i) => (
              <div key={s.type + (s.group || '')} className="budget-type-section" data-type={s.type} data-group={s.group || ''}
                hidden={!(s.type === topTab && (topTab !== 'expense' || s.group === group))}>
                {s.pre.map((r) => <BudgetRow key={r.key} r={r} onValue={setValue} onMenu={(anchor) => setMenu({ key: r.key, anchor })} />)}
                {s.adding
                  ? <AddItemRow type={s.type} label={s.label} onCancel={() => patchSection(i, (x) => ({ ...x, adding: false }))}
                      onAdd={(it) => patchSection(i, (x) => {
                        const r = { key: ++seq, type: s.type, group: s.group, ...it, computed: 0, isCustomized: false, value: fmtNum(it.amount) };
                        if (s.type !== 'expense') return { ...x, adding: false, empty: false, pre: [...x.pre, r] };
                        const bi = x.blocks.findIndex((b) => b.category === it.category);
                        const blocks = bi >= 0 ? x.blocks.map((b, k) => (k === bi ? { ...b, rows: [...b.rows, r] } : b)) : [...x.blocks, { category: it.category, rows: [r] }];
                        return { ...x, adding: false, empty: false, blocks };
                      })} />
                  : <ActionLink icon={plus} className="budget-add-link" onClick={() => patchSection(i, (x) => ({ ...x, adding: true }))}><span>{`New ${s.label}${s.type === 'expense' ? ' expense' : ''}`}</span></ActionLink>}
                {s.empty && <div className="budget-empty">No historical data yet for this section — use "+ New" above to add an item, or create the year and add entries as they come in.</div>}
                {s.rows.map((r) => <BudgetRow key={r.key} r={r} onValue={setValue} onMenu={(anchor) => setMenu({ key: r.key, anchor })} />)}
                {s.blocks.map((b, bi) => (
                  <BlockFrag key={b.category} divider={bi > 0}>
                    <div className="budget-cat-title">{b.category}</div>
                    {b.rows.map((r) => <BudgetRow key={r.key} r={r} onValue={setValue} onMenu={(anchor) => setMenu({ key: r.key, anchor })} />)}
                  </BlockFrag>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="add-actions">
          <Button id="budget-create-btn" disabled={busy} onClick={create}>Create year</Button>
          <Button variant="tertiary" id="budget-cancel-btn" onClick={onClose}>Cancel</Button>
          <span className={'add-status' + (status && status.err ? ' err' : '')} id="budget-status">{status ? status.text : ''}</span>
        </div>
      </div>
      {menu && <RowMenu anchor={menu.anchor} onRemove={() => { removeRow(menu.key); setMenu(null); }} onClose={() => setMenu(null)} />}
    </>
  );
}
const BlockFrag = ({ divider, children }) => <>{divider && <hr className="ds-divider budget-divider" />}{children}</>;

function BudgetRow({ r, onValue, onMenu }) {
  return (
    <div className="budget-row" data-type={r.type} data-group={r.group || ''} data-category={r.category || ''} data-item={r.item} data-computed={r.computed || 0}>
      <span className="br-name" title={r.item}>{r.item}</span>
      {r.isCustomized && <span className="br-tag" title="Set from an earlier customization — used as the default suggestion until changed again">●</span>}
      <span className="br-amt-link"><input type="text" inputMode="decimal" className="br-input" aria-label={`Monthly budget for ${r.item}`} value={r.value} onChange={(e) => onValue(r.key, e.target.value)}
        onBlur={(e) => onValue(r.key, fmtNum(parseAmount(e.target.value)))} /></span>
      <button type="button" className="round-btn tiny br-more" aria-label={`Actions for ${r.item}`} onClick={(e) => { e.stopPropagation(); onMenu(e.currentTarget); }}><Icon icon={actionsIcon} /></button>
    </div>
  );
}

// The row's Actions popover (132:51616): Remove.
function RowMenu({ anchor, onRemove, onClose }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const m = ref.current; if (!m) return;
    const r = anchor.getBoundingClientRect();
    m.style.top = (window.scrollY + r.bottom + 4) + 'px';
    m.style.left = (window.scrollX + r.right - m.offsetWidth) + 'px';
  }, [anchor]);
  useEffect(() => {
    const t = setTimeout(() => document.addEventListener('click', onDoc, true), 0);
    function onDoc(e) { if (ref.current && ref.current.contains(e.target)) return; onClose(); }
    return () => { clearTimeout(t); document.removeEventListener('click', onDoc, true); };
  }, [onClose]);
  return createPortal(
    <div className="br-menu" ref={ref}>
      <button type="button" className="br-menu-remove" onClick={(e) => { e.stopPropagation(); onRemove(); }}><Icon icon={trash} /><span>Remove</span></button>
    </div>, document.body);
}

// Inline "+ New {label}" (the Add expense overlay 119:12764, as an inline row).
function AddItemRow({ type, label, onAdd, onCancel }) {
  const [cat, setCat] = useState(''); const [name, setName] = useState(''); const [amt, setAmt] = useState('');
  const nameRef = useRef(null);
  const ok = () => {
    const item = name.trim();
    if (!item) { nameRef.current?.focus(); return; }
    onAdd({ category: type === 'expense' ? (cat.trim() || 'Other') : null, item, amount: Math.round(parseAmount(amt) * 100) / 100 });
  };
  return (
    <div className="budget-add-row">
      <div className="budget-add-fields">
        <span className="budget-add-label">{label + (type === 'expense' ? ' expense' : '')}</span>
        <input type="text" className="budget-add-input budget-add-cat" placeholder="Category" hidden={type !== 'expense'} value={cat} onChange={(e) => setCat(e.target.value)} />
        <input ref={nameRef} type="text" className="budget-add-input budget-add-name" placeholder="Item name" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="field-with-prefix budget-add-amt">
          <span className="field-prefix">€</span>
          <input type="text" inputMode="decimal" placeholder="0,00" className="budget-add-input" value={amt} onChange={(e) => setAmt(e.target.value)} />
        </div>
      </div>
      <div className="budget-add-actions">
        <button type="button" className="round-btn tiny primary" aria-label="Add item" onClick={ok}><Icon icon={checkmark} /></button>
        <button type="button" className="round-btn tiny secondary" aria-label="Cancel" onClick={onCancel}><Icon icon={x} /></button>
      </div>
    </div>
  );
}
