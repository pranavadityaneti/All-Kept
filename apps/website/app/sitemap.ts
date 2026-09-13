import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-static';

// Every public page, by hand: there are five, and a list nobody has to maintain is a list that
// quietly goes stale the day a sixth is added without one.
export default function sitemap(): MetadataRoute.Sitemap {
  const at = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: at, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/privacy`, lastModified: at, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/terms`, lastModified: at, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/support`, lastModified: at, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/delete`, lastModified: at, changeFrequency: 'monthly', priority: 0.3 },
  ];
}
