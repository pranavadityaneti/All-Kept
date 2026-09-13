import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/site';
import { LegalPage } from '@/components/legal/LegalPage';

export const metadata: Metadata = pageMetadata('Privacy Policy — All Kept', '/privacy');

export default function PrivacyPage() {
  return <LegalPage name="privacy" />;
}
