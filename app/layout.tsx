import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Minha Agenda',
  description: 'Um lugar calmo para decidir o que merece atenção.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
