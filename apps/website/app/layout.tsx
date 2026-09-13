import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Tracking } from '@/components/site/Tracking';
import { APP_STORE_ID, openGraphBase, SHARE_IMAGE, SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from '@/lib/site';
import './globals.css';
import './legal.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

// What every page carries: the share preview (the image beside this file is picked up by name),
// the canonical host, and Safari's App Store banner. Pages add their own title and canonical path.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: { ...openGraphBase, title: SITE_TITLE, url: '/' },
  twitter: { card: 'summary_large_image', title: SITE_TITLE, description: SITE_DESCRIPTION, images: [SHARE_IMAGE.url] },
  itunes: { appId: APP_STORE_ID },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={inter.variable}>
        {children}
        <Tracking />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
