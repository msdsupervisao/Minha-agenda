'use client';

import { useTransition } from 'react';
import { alternarConcluido, excluirCompromisso } from './actions';

type Compromisso = {
  id: string;
  titulo: string;
  descricao: string | null;
  hora: string | null;
  categoria: string;
  concluido: boolean;
};

const CORES_CATEGORIA: Record<string, string> = {
  geral: 'bg-line text-ink/70',
  trabalho: 'bg-clay/15 text-clay',
  pessoal: 'bg-moss/15 text-moss',
  estudo: 'bg-ink/10 text-ink/70',
};

export default function ItemCompromisso({ item }: { item: Compromisso }) {
  const [pendente, iniciarTransicao] = useTransition();

  return (
    <li
      className={`flex items-start gap-3 border border-line rounded-xl px-4 py-3 bg-white/50 transition-opacity ${
        pendente ? 'opacity-50' : ''
      }`}
    >
      <button
        aria-label={item.concluido ? 'Marcar como pendente' : 'Marcar como concluído'}
        onClick={() => iniciarTransicao(() => alternarConcluido(item.id, item.concluido))}
        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 ${
          item.concluido ? 'bg-moss border-moss' : 'border-line'
        }`}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {item.hora && (
            <span className="text-xs font-medium text-ink/50">{item.hora.slice(0, 5)}</span>
          )}
          <span
            className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${
              CORES_CATEGORIA[item.categoria] || CORES_CATEGORIA.geral
            }`}
          >
            {item.categoria}
          </span>
        </div>
        <p className={`font-body font-medium ${item.concluido ? 'line-through text-ink/40' : 'text-ink'}`}>
          {item.titulo}
        </p>
        {item.descricao && (
          <p className="text-sm text-ink/50 mt-0.5">{item.descricao}</p>
        )}
      </div>

      <button
        aria-label="Excluir compromisso"
        onClick={() => iniciarTransicao(() => excluirCompromisso(item.id))}
        className="text-ink/30 hover:text-clay text-sm px-1"
      >
        ✕
      </button>
    </li>
  );
}
