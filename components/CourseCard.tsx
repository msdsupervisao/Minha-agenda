'use client';

import Image from 'next/image';
import { useState } from 'react';

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
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="group rounded-3xl border border-white/10 bg-slate-950/80 overflow-hidden shadow-xl shadow-cyan-500/5 backdrop-blur-xl transition hover:border-cyan-500/30 hover:shadow-xl hover:shadow-cyan-500/10 h-96">
      {!showInfo ? (
        // Seção da Imagem
        <div className="relative w-full h-full">
          <Image
            src={image}
            alt={title}
            fill
            className="object-cover"
          />
          {/* Overlay com botão */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-950/90 flex flex-col justify-end p-6">
            <button
              onClick={() => setShowInfo(true)}
              className="w-full rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/20 hover:border-cyan-500/50"
            >
              Saiba Mais
            </button>
          </div>
        </div>
      ) : (
        // Seção das Informações
        <div className="w-full h-full bg-slate-950/80 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white">{title}</h3>
                {icon && <span className="mt-2 inline-block text-2xl">{icon}</span>}
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-300 leading-relaxed">{description}</p>
          </div>

          <button
            onClick={() => setShowInfo(false)}
            className="w-full rounded-2xl border border-slate-500/30 bg-slate-500/10 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-slate-500/20 hover:border-slate-500/50"
          >
            Voltar
          </button>
        </div>
      )}
    </div>
  );
}
