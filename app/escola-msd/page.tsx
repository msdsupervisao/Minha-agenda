import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DashboardSidebar from '@/components/DashboardSidebar';
import EscolaMsdReposicao from '@/components/EscolaMsdReposicao';

export default async function EscolaMsdPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <main className="bg-slate-950 text-slate-100 min-h-screen">
      <div className="mx-auto grid max-w-[1600px] gap-8 px-4 py-10 xl:grid-cols-[320px_1fr]">
        <DashboardSidebar />

        <div className="space-y-8">
          <div className="flex flex-col gap-6 rounded-[2rem] border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-cyan-500/5 backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/70">Escola MSD</p>
              <h1 className="mt-3 text-4xl font-semibold text-white">Reposição de aulas</h1>
              <p className="mt-2 text-slate-400">Agende reposições de aulas com rapidez e acompanhe os detalhes.</p>
            </div>
            <Link
              href="/agenda"
              className="inline-flex items-center justify-center rounded-3xl border border-cyan-500/20 bg-slate-900/80 px-5 py-3 text-sm font-medium text-cyan-100 transition hover:bg-slate-900 hover:text-white"
            >
              ← Voltar para agenda
            </Link>
          </div>

          <EscolaMsdReposicao />
        </div>
      </div>
    </main>
  );
}
