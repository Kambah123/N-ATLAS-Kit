import type { Metadata, Viewport } from 'next';
import { Fraunces, Outfit } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-outfit',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-fraunces',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'N-ATLAS Playground',
  description:
    'Chat and transcribe with N-ATLaS — Hausa, Igbo, Yorùbá, Nigerian Pidgin, and Nigerian English.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#073326' },
    { media: '(prefers-color-scheme: dark)', color: '#04140f' },
  ],
};

const themeScript = `(function(){try{var t=localStorage.getItem('natlas-theme');var dark=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark);}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${fraunces.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
