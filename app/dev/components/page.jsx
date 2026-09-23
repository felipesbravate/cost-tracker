// Okara component gallery (development only). Every component and state on one page, used by
// tests/ui/parity.py to compare the React components with the legacy tracker.
import { notFound } from 'next/navigation';
import Gallery from './Gallery.jsx';

export const metadata = { title: 'Okara components' };

export default function Page() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_GALLERY !== '1') notFound();
  return <Gallery />;
}
