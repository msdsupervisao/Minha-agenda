import Link from 'next/link';

const MENU_ITEMS = [
  { label: 'Agenda', icon: '📅', href: '#agenda' },
  { label: 'Objetivos', icon: '🎯', href: '#objetivos' },
  { label: 'Tarefas', icon: '✅', href: '#tarefas' },
  { label: 'Prioridades', icon: '🚨', href: '#prioridades' },
  { label: 'Hoje', icon: '📌', href: '#hoje' },
  { label: 'Projetos', icon: '📈', href: '#projetos' },
  { label: 'Financeiro', icon: '💰', href: '#financeiro' },
  { label: 'Cursos', icon: '🎓', href: '/cursos' },
  { label: 'Escola MSD', icon: '👨‍🏫', href: '/escola-msd' },
  { label: 'Faculdade', icon: '🎓', href: '#faculdade' },
  { label: 'Inteligência Artificial', icon: '🤖', href: '#ia' },
  { label: 'Tecnologia', icon: '💻', href: '#tecnologia' },
  { label: 'Cofre Digital', icon: '🔐', href: '#cofre-digital' },
  { label: 'Contatos', icon: '📞', href: '#contatos' },
  { label: 'Estudos', icon: '📚', href: '#estudos' },
  { label: 'Ideias', icon: '💡', href: '#ideias' },
  { label: 'Modelos de Mensagens', icon: '📝', href: '#mensagens' },
  { label: 'Artes e Prompts', icon: '🎨', href: '#prompts' },
  { label: 'Sites Importantes', icon: '🌐', href: '#links' },
  { label: 'Downloads', icon: '📂', href: '#downloads' },
  { label: 'Metas', icon: '🚀', href: '#metas' },
  { label: 'Configurações', icon: '⚙', href: '#configuracoes' },
];

export default function DashboardSidebar() {
  return (
    <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] max-h-[calc(100vh-3rem)] w-full overflow-y-auto rounded-3xl border border-white/10 bg-slate-950/80 p-5 shadow-xl shadow-cyan-500/5 backdrop-blur-xl xl:block">
      <div className="mb-8 rounded-3xl border border-cyan-500/10 bg-slate-900/70 p-5 text-slate-200 shadow-sm">
        <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/60">PADOVA OS</p>
        <h2 className="mt-3 text-xl font-semibold text-white">Painel pessoal</h2>
        <p className="mt-2 text-sm text-slate-400">Tudo centralizado para alto desempenho e foco.</p>
      </div>

      <nav className="space-y-1">
        {MENU_ITEMS.map((item) => (
          <a
            key={item.label}
            href={item.href}
            className="group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-slate-200 transition hover:bg-slate-800/80 hover:text-white"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-300 transition group-hover:bg-cyan-500/15">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </a>
        ))}
      </nav>
    </aside>
  );
}
