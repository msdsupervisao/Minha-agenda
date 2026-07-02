'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function criarCompromisso(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const titulo = String(formData.get('titulo') || '').trim();
  const data = String(formData.get('data') || '');
  const hora = String(formData.get('hora') || '') || null;
  const categoria = String(formData.get('categoria') || 'geral');
  const descricao = String(formData.get('descricao') || '') || null;

  if (!titulo || !data) return;

  const { error } = await supabase.from('compromissos').insert({
    user_id: user.id,
    titulo,
    data,
    hora,
    categoria,
    descricao,
  });

  if (error) {
    console.error('Erro ao criar compromisso:', error);
    throw new Error('Não foi possível salvar o compromisso. ' + error.message);
  }

  revalidatePath('/agenda');
}

export async function alternarConcluido(id: string, concluidoAtual: boolean) {
  const supabase = createClient();
  const { error } = await supabase
    .from('compromissos')
    .update({ concluido: !concluidoAtual })
    .eq('id', id);

  if (error) {
    console.error('Erro ao alternar compromisso:', error);
    throw new Error('Não foi possível atualizar o compromisso. ' + error.message);
  }

  revalidatePath('/agenda');
}

export async function excluirCompromisso(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from('compromissos').delete().eq('id', id);

  if (error) {
    console.error('Erro ao excluir compromisso:', error);
    throw new Error('Não foi possível excluir o compromisso. ' + error.message);
  }

  revalidatePath('/agenda');
}
