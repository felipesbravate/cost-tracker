// The tracker, React version (in parallel with the legacy page at / until the switch).
// The HTML carries no data: everything loads from /api, which enforces sign-in and approval.
import { headers } from 'next/headers';
import Root from '../../src/tracker/Root.jsx';

export const metadata = { title: 'Costs Tracker', icons: { icon: 'data:,' }, robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic'; // a fresh CSP nonce per response (middleware.js)

export default async function Page() {
  await headers(); // opt in to per-request rendering so Next applies the nonce to its scripts
  return (
    <>
      <link rel="stylesheet" precedence="default" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" />
      <Root />
    </>
  );
}
