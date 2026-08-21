'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useState } from 'react';
import styles from './AppShell.module.css';

const NAV_ITEMS = [
  { href: '/hoje', label: 'Hoje' },
  { href: '/agenda', label: 'Agenda' },
  { href: '/financas', label: 'Finanças' },
  { href: '/turmas', label: 'Turmas' },
  { href: '/ajustes', label: 'Ajustes' },
];

function initials(email: string | null) {
  const value = email?.split('@')[0] || 'MA';
  return value.slice(0, 2).toLocaleUpperCase('pt-BR');
}

export default function AppShell({
  title, subtitle, email, children,
}: {
  title: string;
  subtitle?: string;
  email: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <button className={styles.menuButton} type="button" aria-label="Abrir menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <span /><span /><span />
        </button>
        <Link href="/" className={styles.brand} aria-label="Voltar ao assistente">minha<br /><strong>agenda</strong><i>.</i></Link>
        <form className={styles.logoutForm} action="/auth/logout" method="post">
          <button className={styles.profile} type="submit" aria-label="Sair" title={email || 'Sair'}>{initials(email)}</button>
        </form>
      </header>

      <div className={styles.layout}>
        {open && <button className={styles.backdrop} type="button" aria-label="Fechar menu" onClick={() => setOpen(false)} />}
        <aside className={`${styles.nav} ${open ? styles.navOpen : ''}`} aria-label="Navegação">
          <span className={styles.navLabel}>central</span>
          <Link href="/" className={styles.navHome} onClick={() => setOpen(false)}>← Assistente</Link>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname === item.href ? styles.active : ''}
              aria-current={pathname === item.href ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </aside>

        <main className={styles.content}>
          <div className={styles.pageHead}>
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
