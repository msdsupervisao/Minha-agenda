import Image from 'next/image';

export default function CourseCard({
  title,
  description,
  image,
  icon,
}: {
  title: string;
  description: string;
  image: string;
  icon?: string;
}) {
  return (
    <div className="group rounded-3xl border border-white/10 bg-slate-950/80 overflow-hidden shadow-xl shadow-cyan-500/5 backdrop-blur-xl transition hover:border-cyan-500/30 hover:shadow-xl hover:shadow-cyan-500/10">
      {/* Imagem do Curso */}
      <div className="relative h-48 w-full overflow-hidden bg-slate-900">
        <Image
          src={image}
          alt={title}
          fill
          className="object-cover transition group-hover:scale-105"
        />
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-950/80" />
      </div>

      {/* Conteúdo */}
      <div className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            {icon && <span className="mt-2 inline-block text-2xl">{icon}</span>}
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-400 leading-relaxed">{description}</p>
        
        <button className="mt-4 w-full rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/20 hover:border-cyan-500/50">
          Saiba Mais
        </button>
      </div>
    </div>
  );
}
