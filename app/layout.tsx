import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Minha Agenda',
  description: 'Tudo o que você precisa lembrar, num só lugar.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="font-body min-h-screen">{children}</body>
    </html>
  );
}
