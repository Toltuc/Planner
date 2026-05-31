import type { Metadata, Viewport } from 'next';
import './globals.css';
import BackButtonHandler from '@/components/BackButtonHandler';

export const metadata: Metadata = {
  title: 'Планер',
  description: 'Планирование уроков и управление учениками',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body className="safe-area-top safe-area-bottom safe-area-left safe-area-right">
        <BackButtonHandler />
        {children}
      </body>
    </html>
  );
}
