'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Grava o fuso real do dispositivo num cookie que o servidor lê para
// interpretar comandos, disparar notificações e exibir datas no horário do
// celular — em vez de um fuso fixo. Só recarrega dados quando o fuso muda.
export default function TimezoneSync() {
  const router = useRouter();
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz) return;
      const current = document.cookie.split('; ').find((row) => row.startsWith('tz='))?.slice(3);
      if (current === tz) return;
      document.cookie = `tz=${tz}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    } catch {
      // Ambiente sem Intl/cookies: mantém o fuso padrão do servidor.
    }
  }, [router]);
  return null;
}
