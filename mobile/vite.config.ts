import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Reaproveita regras puras da Agenda (ex.: normalizeWhatsAppPhone) sem duplicar:
// o main.ts importa de ../../lib/assistant/whatsapp-handoff.ts. Liberamos o acesso
// do dev server à raiz do repositório para o import funcionar também em `vite dev`.
export default defineConfig({
  server: {
    fs: { allow: [resolve(__dirname, '..')] },
  },
  build: {
    target: 'es2022',
  },
});
