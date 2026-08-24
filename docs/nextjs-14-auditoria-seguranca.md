# Auditoria de segurança e migração para Next.js 16

Auditoria inicial executada em 19 de agosto de 2026 e resolvida em 24 de agosto de 2026.

## Estado

- Next.js atual: `16.3.2` (Active LTS na data da migração).
- React e React DOM atuais: `19.2.8`.
- ESLint CLI com configuração flat do Next.js 16.
- `npm audit --omit=dev`: zero vulnerabilidades conhecidas.
- `npm run lint`, `npm test` e `npm run build`: aprovados.

## Advisories encontrados antes da migração

### nanoid

- `GHSA-28wg-ghj8-5hjv` — loop com tamanho negativo — afetado `<3.3.16`.
- `GHSA-2v37-7h3g-55p8` — loop com tamanho zero — afetado `<3.3.18`.

### postcss

- `GHSA-qx2v-qp2m-jg93` — XSS em serialização CSS — afetado `<8.5.10`.
- `GHSA-6g55-p6wh-862q` — leitura arbitrária via source map — afetado `<=8.5.11`.
- `GHSA-fxqj-rqcc-2cmp` — correção incompleta de leitura de source map — afetado `<=8.5.22`.
- `GHSA-r28c-9q8g-f849` — path traversal em source map — afetado `<=8.5.17`.

### next

- `GHSA-7m27-7ghc-44w9`, `GHSA-mwv6-3258-q52c`, `GHSA-5j59-xgg2-r9c4`, `GHSA-q4gf-8mx6-v5v3`, `GHSA-8h8q-6873-q5fj`, `GHSA-m99w-x7hq-7vfj` — negação de serviço em Server Actions/Server Components.
- `GHSA-f82v-jwr5-mffw`, `GHSA-36qx-fr4f-26g5` — bypass de autorização/middleware.
- `GHSA-4342-x723-ch2f`, `GHSA-c4j6-fc7j-m34r`, `GHSA-89xv-2m56-2m9x`, `GHSA-p9j2-gv94-2wf4` — SSRF em middleware, WebSocket, Server Actions ou rewrites.
- `GHSA-g5qg-72qw-gw5v`, `GHSA-qpjv-v59x-3qc4`, `GHSA-3g8h-86w9-wvmq`, `GHSA-vfv6-92ff-j949`, `GHSA-wfc6-r584-vfw7`, `GHSA-68g3-v927-f742`, `GHSA-4633-3j49-mh5q` — confusão ou envenenamento de cache.
- `GHSA-xv57-4mr9-wg8v`, `GHSA-ffhc-5mcf-pf4q`, `GHSA-gx5p-jg67-6x7h` — injeção de conteúdo/XSS.
- `GHSA-3h52-269p-cp9r`, `GHSA-955p-x3mx-jcvp` — exposição de informações.
- `GHSA-9g9p-9gw9-jx7f`, `GHSA-3x4c-7xq6-9pq8`, `GHSA-h64f-5h5j-jqjh`, `GHSA-4c39-4ccg-62r3` — esgotamento de recursos em imagem ou payload.
- `GHSA-h25m-26qc-wcjf` — desserialização insegura/DoS.
- `GHSA-ggv3-7p47-pfv8` — request smuggling em rewrites.

A atualização para `16.3.2` removeu da árvore todas as versões sinalizadas acima. A seção permanece como histórico da motivação da migração.

## Mudanças aplicadas

Na migração 14 → 16 foram tratados:

- React 19 e os tipos correspondentes;
- `cookies()` e `searchParams` assíncronos;
- convenção `middleware.ts` renomeada para `proxy.ts`;
- configuração de imagens migrada de `domains` para `remotePatterns`;
- `next lint` substituído por ESLint CLI com flat config;
- JSX automático e tipos de rotas gerados pelo Next.js 16;
- build padrão com Turbopack.

Referências oficiais: [upgrade para Next.js 15](https://nextjs.org/docs/app/guides/upgrading/version-15), [upgrade para Next.js 16](https://nextjs.org/docs/app/guides/upgrading/version-16) e [política de suporte](https://nextjs.org/support-policy).
