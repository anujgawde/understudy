import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Understudy',
  description: 'Computer-use automation console',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
