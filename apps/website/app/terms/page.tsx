import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';

export const metadata: Metadata = { title: 'Terms of Service — All Kept', alternates: { canonical: '/terms' }, openGraph: { url: '/terms' } };

export default function TermsPage() {
  return <LegalPage name="terms" />;
}
