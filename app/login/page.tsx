import { redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { login } from './actions';
import styles from './Login.module.css';

const messages: Record<string, string> = {
  invalid_fields: 'Informe um e-mail válido e sua senha.',
  invalid_credentials: 'E-mail ou senha inválidos.',
  not_configured: 'O projeto Supabase ainda não foi configurado.',
};

export default async function LoginPage({ searchParams }: { searchParams?: { error?: string } }) {
  const configured = getSupabasePublicConfig().configured;
  if (configured && await getAuthenticatedUser()) redirect('/');
  const error = searchParams?.error ? messages[searchParams.error] : null;

  return <main className={styles.shell}>
    <section className={styles.card}>
      <div className={styles.brand}>minha <strong>agenda</strong><i>.</i></div>
      <p className={styles.eyebrow}>memória protegida</p>
      <h1>Entre para continuar.</h1>
      <p className={styles.copy}>Seus gastos, lembretes e contexto ficam vinculados à sua conta.</p>
      {!configured && <p className={styles.notice}>Supabase ainda não configurado. Consulte o guia da Fase 5.</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <form action={login}>
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="email" required disabled={!configured} />
        <label htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" autoComplete="current-password" minLength={6} required disabled={!configured} />
        <button type="submit" disabled={!configured}>Entrar</button>
      </form>
    </section>
  </main>;
}
