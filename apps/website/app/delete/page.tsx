import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';
import html from '@/content/delete.html?raw';

export const metadata: Metadata = { title: 'Delete your data — All Kept' };

export default function DeletePage() {
  return <LegalPage html={html} />;
}
