'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export async function entrar(formData: FormData) {
  const email = String(formData.get('email') || '');
  const senha = String(formData.get('senha') || '');

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

  if (error) {
    redirect(`/login?erro=${encodeURIComponent(traduzErro(error.message))}`);
  }

  redirect('/agenda');
}

export async function cadastrar(formData: FormData) {
  const email = String(formData.get('email') || '');
  const senha = String(formData.get('senha') || '');

  const supabase = createClient();
  const { error } = await supabase.auth.signUp({ email, password: senha });

  if (error) {
    redirect(`/login?erro=${encodeURIComponent(traduzErro(error.message))}`);
  }

  redirect('/login?aviso=Conta criada. Verifique seu e-mail se a confirmação estiver ativada, ou apenas entre agora.');
}

export async function sair() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

function traduzErro(mensagem: string) {
  if (mensagem.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (mensagem.includes('User already registered')) return 'Este e-mail já tem uma conta. Tente entrar.';
  if (mensagem.includes('Password should be at least')) return 'A senha precisa ter pelo menos 6 caracteres.';
  return mensagem;
}
