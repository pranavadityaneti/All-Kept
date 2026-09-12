import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import './legal.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'All Kept — Your saves, sorted.',
  description:
    'One library for everything you save across Instagram, YouTube and the web. AI files it under food, travel, places and more. You just search. Launching 21 September 2026.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={inter.variable}>{children}</body>
    </html>
  );
}
