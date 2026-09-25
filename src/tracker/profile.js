'use client';
// The account's name and picture, kept encrypted in the vault's `settings` collection like the rest of the data:
// settings/profile = { firstName, lastName }, settings/avatar = { image } (a small JPEG data URL, made in the browser).
import { useEffect, useState } from 'react';
import { db } from './api.js';
import { firstNameOf } from './AccountBar.jsx';

export function useProfile(me) {
  const [p, setP] = useState({ firstName: '', lastName: '', image: null, loaded: false });
  useEffect(() => db.collection('settings').onSnapshot((snap) => {
    const get = (id) => { const d = snap.docs.find((x) => x.id === id); return d ? d.data() : null; };
    const prof = get('profile') || {}, av = get('avatar') || {};
    setP({ firstName: prof.firstName || '', lastName: prof.lastName || '', image: typeof av.image === 'string' ? av.image : null, loaded: true });
  }), []);
  // The greeting and the menu use the first name when there is one, else the part of the email before the dot.
  const name = p.firstName.trim() || firstNameOf(me && me.email);
  return { ...p, name };
}

export const saveProfile = (firstName, lastName) => db.doc('settings/profile').set({ firstName: firstName.trim().slice(0, 80), lastName: lastName.trim().slice(0, 80) });
export const saveAvatar = (image) => db.doc('settings/avatar').set({ image });
export const removeAvatar = () => db.doc('settings/avatar').delete();

// A square JPEG of the picture's centre, 176px (the 88px avatar at 2x), small enough for one vault document.
export async function avatarFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('not an image')); i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas'); c.width = c.height = 176;
    c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 176, 176);
    for (const q of [0.85, 0.7, 0.55]) { const d = c.toDataURL('image/jpeg', q); if (d.length < 24000) return d; }
    return c.toDataURL('image/jpeg', 0.4);
  } finally { URL.revokeObjectURL(url); }
}
