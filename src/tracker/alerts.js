'use client';
// Over-budget alerts for the bell: Variable, Additional and Extra expense items whose entries add up to more than the
// item's budget (model.budgetAlerts). Which ones the user has seen is kept in the vault (settings/notifications), so
// the red dot is the same on every device.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from './api.js';
import { createModel, yearsFromDocs } from './model.js';

export function useSeenAlerts() {
  const [seen, setSeen] = useState(null); // null while loading
  useEffect(() => db.collection('settings').onSnapshot((snap) => {
    const d = snap.docs.find((x) => x.id === 'notifications');
    const v = d ? d.data() : null;
    setSeen(new Set(v && Array.isArray(v.seen) ? v.seen : []));
  }), []);
  const markSeen = useCallback((ids) => {
    if (!seen || ids.every((id) => seen.has(id))) return;
    const next = [...new Set([...seen, ...ids])].slice(-300);
    setSeen(new Set(next));
    db.doc('settings/notifications').set({ seen: next }).catch(() => {});
  }, [seen]);
  return [seen, markSeen];
}

const COLLECTIONS = ['years', 'entries', 'overrides', 'budgets', 'budgetDefaults'];
// For pages without the tracker's model (Account): loads what the alerts need and builds the model.
export function useBudgetAlertsStandalone() {
  const [data, setData] = useState({ years: [], entries: [], overrides: [], budgets: [], budgetDefaults: [] });
  useEffect(() => {
    const offs = COLLECTIONS.map((name) => db.collection(name).onSnapshot((snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setData((x) => ({ ...x, [name]: docs }));
    }));
    return () => offs.forEach((off) => off());
  }, []);
  return useMemo(() => createModel({ data: yearsFromDocs(data.years), entries: data.entries, overrides: data.overrides, budgets: data.budgets, budgetDefaults: data.budgetDefaults }).budgetAlerts(), [data]);
}
