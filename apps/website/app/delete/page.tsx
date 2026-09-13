import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/site';
import { LegalPage } from '@/components/legal/LegalPage';

export const metadata: Metadata = pageMetadata('Delete your data — All Kept', '/delete');

export default function DeletePage() {
  return <LegalPage name="delete" />;
}
