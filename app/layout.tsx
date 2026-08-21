import type { Metadata, Viewport } from 'next';
import RegisterSW from '@/components/RegisterSW';
import './globals.css';

export const metadata: Metadata = {
  title: 'Minha Agenda',
  description: 'Um lugar calmo para decidir o que merece atenção.',
  applicationName: 'Minha Agenda',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Minha Agenda' },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#020608',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
