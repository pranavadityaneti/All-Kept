import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';

export const metadata: Metadata = { title: 'Privacy Policy — All Kept', alternates: { canonical: '/privacy' }, openGraph: { url: '/privacy' } };

export default function PrivacyPage() {
  return <LegalPage name="privacy" />;
}
