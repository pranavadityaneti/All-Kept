import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';

export const metadata: Metadata = { title: 'Privacy Policy — All Kept' };

export default function PrivacyPage() {
  return <LegalPage name="privacy" />;
}
