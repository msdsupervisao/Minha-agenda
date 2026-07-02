import DashboardCard from '@/components/DashboardCard';

export default function AgendaDashboard() {
  return (
    <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-2">
          <DashboardCard
            title="Próximo compromisso"
            value="Aula Photoshop"
            description="Hoje às 09:00"
            accent="Já chegou"
          />
          <DashboardCard
            title="Prioridades"
            value="4 itens"
            description="Responda pais, criar arte, aula designer, faculdade"
            accent="Foco total"
          />
        </div>

        <div className="grid gap-6 md:grid-cols-3 xl:grid-cols-3">
          <DashboardCard
            title="Projetos"
            value="11"
            description="Ativos neste mês"
            accent="Top"
          />
          <DashboardCard
            title="Tarefas concluídas"
            value="18 / 32"
            description="Produtividade atual"
            accent="89%"
          />
          <DashboardCard
            title="Senhas"
            value="67 itens"
            description="Cofre digital seguro"
          />
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-6 shadow-xl shadow-cyan-500/5 backdrop-blur-xl">
            <p className="text-sm uppercase tracking-[0.24em] text-cyan-300/70">Atalhos</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {['Nova tarefa', 'Novo compromisso', 'Nova senha', 'Nova ideia'].map((item) => (
                <button
                  key={item}
                  className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-left text-sm text-slate-200 transition hover:border-cyan-500/20 hover:bg-slate-900"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-6 shadow-xl shadow-cyan-500/5 backdrop-blur-xl">
            <p className="text-sm uppercase tracking-[0.24em] text-cyan-300/70">Status</p>
            <div className="mt-6 space-y-4">
              <div>
                <p className="text-sm text-slate-400">Projetos</p>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full w-3/4 rounded-full bg-cyan-400" />
                </div>
              </div>
              <div>
                <p className="text-sm text-slate-400">Tarefas</p>
                <p className="mt-2 text-3xl font-semibold text-white">18 / 32</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Produtividade</p>
                <p className="mt-2 text-3xl font-semibold text-emerald-400">89%</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-6 shadow-xl shadow-cyan-500/5 backdrop-blur-xl">
          <p className="text-sm uppercase tracking-[0.24em] text-cyan-300/70">Agenda hoje</p>
          <div className="mt-6 space-y-4">
            {[
              { time: '07:00', title: 'Designer' },
              { time: '09:00', title: 'Reunião' },
              { time: '11:00', title: 'Resolver DKSoft' },
              { time: '14:00', title: 'Criar Arte' },
              { time: '19:00', title: 'Revisão' },
            ].map((item) => (
              <div key={item.time} className="flex items-center justify-between rounded-3xl border border-white/10 bg-slate-900/70 px-4 py-4">
                <div>
                  <p className="text-sm text-slate-400">{item.time}</p>
                  <p className="mt-1 text-base font-semibold text-white">{item.title}</p>
                </div>
                <span className="rounded-2xl bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100">Agenda</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-6 shadow-xl shadow-cyan-500/5 backdrop-blur-xl">
          <p className="text-sm uppercase tracking-[0.24em] text-cyan-300/70">Banco de mensagens</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              'Pais',
              'Alunos',
              'Professores',
              'Funcionários',
              'Cobrança',
              'Boas-vindas',
              'Aniversário',
              'Feriado',
            ].map((item) => (
              <button
                key={item}
                className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-slate-200 transition hover:border-cyan-500/20 hover:bg-slate-900"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
