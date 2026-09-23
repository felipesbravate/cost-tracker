'use client';
import { useEffect, useRef, useState } from 'react';
import { deleteMe, listUsers, setUserStatus, signOut } from './api.js';

// The account bar above the page (who is signed in, admin approvals, delete my data, sign out).
export function AccountBar({ me }) {
  const [armed, setArmed] = useState(false);
  const [users, setUsers] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!me) return null;
  const toLogin = () => { location.href = '/login'; };
  const onDelete = () => {
    if (!armed) { setArmed(true); timer.current = setTimeout(() => setArmed(false), 5000); return; }
    deleteMe().then(() => signOut()).then(toLogin);
  };
  return (
    <>
      <div className="ct-shell">
        <span className="ct-who">{me.email}</span>
        {me.isAdmin && <button type="button" className="ct-btn" onClick={async () => setUsers((await listUsers()).users)}>Approve users</button>}
        <button type="button" className="ct-btn" onClick={onDelete}>{armed ? 'Click again to permanently delete' : 'Delete all my data'}</button>
        <button type="button" className="ct-btn" onClick={() => signOut().then(toLogin)}>Sign out</button>
      </div>
      {users && <UsersDialog users={users} onClose={() => setUsers(null)} />}
    </>
  );
}

function UsersDialog({ users, onClose }) {
  const ref = useRef(null);
  const [status, setStatus] = useState({});
  useEffect(() => { ref.current?.showModal(); }, []);
  const act = async (u, a) => { await setUserStatus(u.id, a); setStatus((s) => ({ ...s, [u.id]: a === 'approve' ? 'approved' : 'blocked' })); };
  return (
    <dialog ref={ref} className="ct-dialog" onClose={onClose}>
      <h2>Users</h2>
      {users.map((u) => (
        <div key={u.id} className="ct-row">
          <span>{u.email + ' · ' + (status[u.id] || u.status)}</span>
          <button type="button" className="ct-btn" onClick={() => act(u, 'approve')}>Approve</button>
          <button type="button" className="ct-btn" onClick={() => act(u, 'block')}>Block</button>
        </div>
      ))}
      <button type="button" className="ct-btn" onClick={() => { ref.current?.close(); }}>Close</button>
    </dialog>
  );
}
