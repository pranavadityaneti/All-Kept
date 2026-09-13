import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/site';
import { LegalPage } from '@/components/legal/LegalPage';

export const metadata: Metadata = pageMetadata('Terms of Service — All Kept', '/terms');

export default function TermsPage() {
  return <LegalPage name="terms" />;
}
