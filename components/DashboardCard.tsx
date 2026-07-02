export default function DashboardCard({
  title,
  value,
  description,
  accent,
}: {
  title: string;
  value: string;
  description?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-6 shadow-xl shadow-cyan-500/5 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm uppercase tracking-[0.24em] text-cyan-300/70">{title}</p>
        {accent ? (
          <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100">{accent}</span>
        ) : null}
      </div>
      <p className="mt-4 text-3xl font-semibold text-white">{value}</p>
      {description ? <p className="mt-2 text-sm text-slate-400">{description}</p> : null}
    </div>
  );
}
