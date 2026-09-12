import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';
import html from '@/content/terms.html?raw';

export const metadata: Metadata = { title: 'Terms of Service — All Kept' };

export default function TermsPage() {
  return <LegalPage html={html} />;
}
