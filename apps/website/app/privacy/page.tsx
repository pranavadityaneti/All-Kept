import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';
import html from '@/content/privacy.html?raw';

export const metadata: Metadata = { title: 'Privacy Policy — All Kept' };

export default function PrivacyPage() {
  return <LegalPage html={html} />;
}
