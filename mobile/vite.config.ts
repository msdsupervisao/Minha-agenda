import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';

// Reaproveita regras puras da Agenda (ex.: normalizeWhatsAppPhone) sem duplicar:
// o main.ts importa de ../../lib/assistant/whatsapp-handoff.ts. Liberamos o acesso
// do dev server à raiz do repositório para o import funcionar também em `vite dev`.
export default defineConfig(({ mode }) => {
  const apiBase = process.env.VITE_API_BASE || loadEnv(mode, __dirname, 'VITE_').VITE_API_BASE;
  if (!apiBase?.trim()) throw new Error('VITE_API_BASE é obrigatória para compilar o aplicativo Android.');
  const apiUrl = new URL(apiBase);
  if (apiUrl.protocol !== 'https:' && apiUrl.hostname !== 'localhost') {
    throw new Error('VITE_API_BASE precisa usar HTTPS.');
  }

  return {
    server: {
      fs: { allow: [resolve(__dirname, '..')] },
    },
    build: {
      target: 'es2022',
    },
  };
});
