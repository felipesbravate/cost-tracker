'use client';
// The tracker renders in the browser only: its figures depend on today's date and on data that loads from
// /api after sign-in, so server-rendered HTML would only be an empty shell that mismatches on hydration.
import dynamic from 'next/dynamic';

const TrackerApp = dynamic(() => import('./TrackerApp.jsx'), { ssr: false });
export default function Root() { return <TrackerApp />; }
