'use client';
import { useCallback, useState } from 'react';
import { Modal } from '../ui/index.js';
import { trashCan } from '../ui/illustrations.js';

// Every destructive action asks first with the Okara Modal, as in the Cost-tracker delete-year modal (258:10267):
// Trash can illustration, "Are you sure you want to delete …?", Cancel + a red Delete.
//   const [confirmModal, confirm] = useConfirm();
//   confirm({ title, description, onConfirm: async () => { … } });  // render {confirmModal} once
// Delete stays disabled ("Deleting…") while onConfirm runs; the modal closes when it settles.
export function useConfirm() {
  const [req, setReq] = useState(null);
  const [busy, setBusy] = useState(false);
  const confirm = useCallback((r) => setReq(r), []);
  const close = useCallback(() => { if (!busy) setReq(null); }, [busy]);
  const run = async () => {
    setBusy(true);
    try { await req.onConfirm(); } finally { setBusy(false); setReq(null); }
  };
  const modal = (
    <Modal id="confirm-modal" open={!!req} onClose={close} title={req ? req.title : ''} description={req ? req.description : ''}
      illustration={req && req.illustration !== undefined ? req.illustration : trashCan}
      secondary={{ label: 'Cancel', onClick: close, disabled: busy, id: 'confirm-cancel' }}
      primary={{ label: busy ? 'Deleting…' : (req && req.confirmLabel) || 'Delete', onClick: run, disabled: busy, destructive: true, id: 'confirm-delete' }} />
  );
  return [modal, confirm];
}
