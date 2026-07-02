import { createClient } from '@/lib/supabase/server';
import { criarCompromisso } from './actions';
import { sair } from '../login/actions';
import DashboardSidebar from '@/components/DashboardSidebar';
import AgendaDashboard from './dashboard';
import EscolaMsdReposicao from '@/components/EscolaMsdReposicao';
import ItemCompromisso from './ItemCompromisso';

export default async function AgendaPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: compromissos } = await supabase
    .from('compromissos')
    .select('*')
    .order('data', { ascending: true })
    .order('hora', { ascending: true });

  const grupos = agruparPorData(compromissos || []);
  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <main className="bg-slate-950 text-slate-100 min-h-screen">
      <div className="mx-auto grid max-w-[1600px] gap-8 px-4 py-8 xl:grid-cols-[320px_1fr]">
        <DashboardSidebar />

        <div className="space-y-8">
          <section className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-cyan-500/5 backdrop-blur-xl">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/70">Olá Fernando</p>
                <h1 className="mt-3 text-4xl font-semibold text-white">Bem-vindo ao PADOVA OS</h1>
                <p className="mt-2 text-slate-400">Hoje é {new Date().toLocaleDateString('pt-BR')}</p>
              </div>
              <form action={sair} className="inline-flex rounded-3xl border border-cyan-500/20 bg-slate-900/80 p-3">
                <button className="text-sm text-cyan-100 transition hover:text-white">Sair</button>
              </form>
            </div>
          </section>

          <AgendaDashboard />

          <EscolaMsdReposicao />

          <section className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-cyan-500/5 backdrop-blur-xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-white">Minha agenda</h2>
                <p className="mt-2 text-slate-400">Próximos compromissos e tarefas do dia.</p>
              </div>
            </div>

            <form action={criarCompromisso} className="mt-8 space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <input
                  name="titulo"
                  placeholder="O que você precisa lembrar?"
                  required
                  className="w-full rounded-3xl border border-white/10 bg-slate-950/80 px-4 py-4 text-slate-100 outline-none transition focus:border-cyan-400"
                />
                <input
                  type="date"
                  name="data"
                  required
                  defaultValue={hoje}
                  className="w-full rounded-3xl border border-white/10 bg-slate-950/80 px-4 py-4 text-slate-100 outline-none transition focus:border-cyan-400"
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <input
                  type="time"
                  name="hora"
                  className="w-full rounded-3xl border border-white/10 bg-slate-950/80 px-4 py-4 text-slate-100 outline-none transition focus:border-cyan-400"
                />
                <select
                  name="categoria"
                  defaultValue="geral"
                  className="w-full rounded-3xl border border-white/10 bg-slate-950/80 px-4 py-4 text-slate-100 outline-none transition focus:border-cyan-400"
                >
                  <option value="geral">Geral</option>
                  <option value="trabalho">Trabalho</option>
                  <option value="pessoal">Pessoal</option>
                  <option value="estudo">Estudo</option>
                </select>
              </div>
              <input
                name="descricao"
                placeholder="Detalhes (opcional)"
                className="w-full rounded-3xl border border-white/10 bg-slate-950/80 px-4 py-4 text-slate-100 outline-none transition focus:border-cyan-400"
              />
              <button
                type="submit"
                className="w-full rounded-3xl bg-cyan-500 px-6 py-4 font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                Guardar compromisso
              </button>
            </form>
          </section>

          {grupos.length === 0 ? (
            <div className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-8 text-center shadow-2xl shadow-cyan-500/5 backdrop-blur-xl">
              <p className="text-lg font-medium text-white">Nenhum compromisso encontrado.</p>
              <p className="mt-2 text-slate-400">Adicione um compromisso para começar o dia com foco.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {grupos.map(([data, itens]) => (
                <section
                  key={data}
                  className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-cyan-500/5 backdrop-blur-xl"
                >
                  <h3 className="text-xl font-semibold text-white">{formatarDataLonga(data)}</h3>
                  <p className="mt-2 text-sm text-slate-400">{data === hoje ? 'Hoje' : 'Próximos compromissos'}</p>
                  <ul className="mt-6 space-y-3">
                    {itens.map((item: any) => (
                      <ItemCompromisso key={item.id} item={item} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function agruparPorData(lista: any[]) {
  const mapa = new Map<string, any[]>();
  for (const item of lista) {
    const chave = item.data;
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave)!.push(item);
  }
  return Array.from(mapa.entries());
}

function formatarDataLonga(dataIso: string) {
  const data = new Date(dataIso + 'T00:00:00');
  return data.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}
