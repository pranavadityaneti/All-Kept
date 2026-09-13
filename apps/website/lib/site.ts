// The site's public identifiers. Public by nature — each one is visible in the page source of every
// site that uses it — so they live here rather than in a dashboard nobody can grep.
export const SITE_URL = 'https://www.allkept.app';
export const SITE_NAME = 'All Kept';
export const SITE_TITLE = 'All Kept — Your saves, sorted.';
export const SITE_DESCRIPTION =
  'One library for everything you save across Instagram, YouTube and the web. AI files it under food, travel, places and more. You just search. Launching 21 September 2026.';
/** Meta Pixel — Events Manager → Allkept. */
export const META_PIXEL_ID = '1608009750873679';
/** Google Analytics 4 measurement id. Empty would mean: load nothing. */
export const GA_MEASUREMENT_ID = 'G-WZDX3LHXGB';
/** The iOS app, for Safari's App Store banner. */
export const APP_STORE_ID = '6809901300';

/**
 * The share preview every page carries. Next replaces a page's whole openGraph block rather than
 * merging it with the layout's, so a page that sets its own canonical must spread this first or
 * lose the image and the site name with it.
 */
export const SHARE_IMAGE = { url: '/opengraph-image.jpg', width: 1200, height: 630, alt: 'All Kept — one library for everything you save, sorted for you.' };
export const openGraphBase = {
  type: 'website' as const,
  siteName: SITE_NAME,
  locale: 'en_US',
  description: SITE_DESCRIPTION,
  images: [SHARE_IMAGE],
};
/** Title, canonical and a complete share preview for one page. */
export function pageMetadata(title: string, path: string) {
  return {
    title,
    alternates: { canonical: path },
    openGraph: { ...openGraphBase, title, url: path },
    twitter: { card: 'summary_large_image' as const, title, description: SITE_DESCRIPTION, images: [SHARE_IMAGE.url] },
  };
}
