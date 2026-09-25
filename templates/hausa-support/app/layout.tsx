import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hausa support · N-ATLAS',
  description: 'A Hausa customer-support chatbot built with n-atlas.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ha">
      <body>{children}</body>
    </html>
  );
}
