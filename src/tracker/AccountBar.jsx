'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Notification, NotificationItem, UserMenu, UserNav } from '../ui/index.js';
import { signOut as signOutIcon } from '../ui/icons.js';
import { deleteMe, listUsers, setUserStatus, signOut } from './api.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The first name the header greets: the account's email up to the first dot, dash, underscore or plus, capitalised
// ("felipe.sbravate@…" → "Felipe"). The account has no name field.
export function firstNameOf(email) {
  const part = String(email || '').split('@')[0].split(/[._+\-\d]/).find(Boolean) || '';
  return part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : 'there';
}

// User nav (DS 230:618) in the page header: notifications (for an admin: accounts waiting for approval) and the
// user menu (Account, Admin for admins, Sign out).
export function AccountNav({ me }) {
  const [open, setOpen] = useState(null); // 'notif' | 'user' | null
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState({});
  const [dialog, setDialog] = useState(null); // 'account' | 'admin'
  const close = useCallback(() => setOpen(null), []);

  const loadPending = useCallback(async () => {
    if (!me || !me.isAdmin) return;
    try { const r = await listUsers(); setPending((r.users || []).filter((u) => u.status === 'pending')); } catch { /* keep the last list */ }
  }, [me]);
  useEffect(() => { loadPending(); }, [loadPending]);

  if (!me) return null;
  const approve = async (u) => {
    setBusy((b) => ({ ...b, [u.id]: true }));
    try { await setUserStatus(u.id, 'approve'); setPending((p) => p.filter((x) => x.id !== u.id)); }
    finally { setBusy((b) => ({ ...b, [u.id]: false })); }
  };
  const name = firstNameOf(me.email);
  const items = [
    { key: 'account', id: 'menu-account', label: 'Account', onSelect: () => { setOpen(null); setDialog('account'); } },
    ...(me.isAdmin ? [{ key: 'admin', id: 'menu-admin', label: 'Admin', onSelect: () => { setOpen(null); setDialog('admin'); } }] : []),
    { key: 'signout', id: 'menu-signout', label: 'Sign out', icon: signOutIcon, onSelect: () => signOut().then(() => { location.href = '/login'; }) },
  ];
  return (
    <>
      <UserNav>
        <Notification open={open === 'notif'} unread={pending.length > 0} onClose={close}
          onToggle={() => { setOpen((o) => (o === 'notif' ? null : 'notif')); if (open !== 'notif') loadPending(); }}>
          {pending.length
            ? pending.map((u) => {
              const d = new Date(u.created_at);
              const ok = !isNaN(d);
              return (
                <NotificationItem key={u.id} date={ok ? `${MON[d.getMonth()]} ${d.getDate()}` : ''} time={ok ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''}
                  action={{ label: 'Approve', onClick: () => approve(u), disabled: !!busy[u.id] }}>
                  {`${u.email} is waiting for your approval.`}
                </NotificationItem>
              );
            })
            : <div className="ds-notif-item ds-notif-empty"><div className="ds-notif-text">No notifications.</div></div>}
        </Notification>
        <UserMenu name={name} open={open === 'user'} onClose={close} onToggle={() => setOpen((o) => (o === 'user' ? null : 'user'))} items={items} />
      </UserNav>
      {dialog === 'account' && <AccountDialog me={me} onClose={() => setDialog(null)} />}
      {dialog === 'admin' && <UsersDialog onClose={() => { setDialog(null); loadPending(); }} />}
    </>
  );
}

function useModal(onClose) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return [ref, { onClose, onCancel: onClose }];
}

// Account: who is signed in, and deleting every entry of this account (two clicks).
function AccountDialog({ me, onClose }) {
  const [ref, handlers] = useModal(onClose);
  const [armed, setArmed] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onDelete = () => {
    if (!armed) { setArmed(true); timer.current = setTimeout(() => setArmed(false), 5000); return; }
    deleteMe().then(() => signOut()).then(() => { location.href = '/login'; });
  };
  return (
    <dialog ref={ref} className="ct-dialog" id="account-dialog" {...handlers}>
      <h2 className="ct-dialog-title">Account</h2>
      <p className="ct-dialog-text">{`Signed in as ${me.email}`}</p>
      <div className="ct-dialog-actions">
        <Button variant="secondary" id="delete-data-btn" onClick={onDelete}>{armed ? 'Click again to permanently delete' : 'Delete all my data'}</Button>
        <Button variant="tertiary" onClick={() => ref.current?.close()}>Close</Button>
      </div>
    </dialog>
  );
}

// Admin: every account, with Approve and Block.
function UsersDialog({ onClose }) {
  const [ref, handlers] = useModal(onClose);
  const [users, setUsers] = useState(null);
  useEffect(() => { listUsers().then((r) => setUsers(r.users || [])).catch(() => setUsers([])); }, []);
  const act = async (u, a) => { await setUserStatus(u.id, a); setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, status: a === 'approve' ? 'approved' : 'blocked' } : x))); };
  return (
    <dialog ref={ref} className="ct-dialog" id="users-dialog" {...handlers}>
      <h2 className="ct-dialog-title">Users</h2>
      {!users ? <p className="ct-dialog-text">Loading…</p> : users.map((u) => (
        <div key={u.id} className="ct-row">
          <span>{u.email + ' · ' + u.status}</span>
          <Button size="small" variant="secondary" onClick={() => act(u, 'approve')}>Approve</Button>
          <Button size="small" variant="secondary" onClick={() => act(u, 'block')}>Block</Button>
        </div>
      ))}
      <div className="ct-dialog-actions"><Button variant="tertiary" onClick={() => ref.current?.close()}>Close</Button></div>
    </dialog>
  );
}
