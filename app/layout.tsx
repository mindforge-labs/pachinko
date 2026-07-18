import '../styles.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Nocturne Nova — Tech Stack Spinner',
  description: 'Nocturne Nova tech-stack spinner — roll FE, BE, and DB frameworks.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#080510',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning data-pachislot-app="" data-backdrop="arcade">
        {children}
      </body>
    </html>
  );
}
