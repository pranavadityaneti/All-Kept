import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';

export const metadata: Metadata = { title: 'Delete your data — All Kept' };

export default function DeletePage() {
  return <LegalPage name="delete" />;
}
