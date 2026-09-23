// /v2 was the React tracker's address while it ran next to the legacy page. It is the tracker at / now.
import { redirect } from 'next/navigation';
export default function Page() { redirect('/'); }
