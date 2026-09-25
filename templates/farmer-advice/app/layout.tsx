import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Farmer advice · N-ATLAS',
  description: 'Farming advice in Hausa, Yorùbá, or Igbo, built with n-atlas.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ha">
      <body>{children}</body>
    </html>
  );
}
