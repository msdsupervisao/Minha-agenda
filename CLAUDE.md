# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev          # Supervised dev: boots the OmniRoute gateway, THEN next dev (see scripts/system.mjs)
npm run dev:web      # next dev only (127.0.0.1), WITHOUT the gateway — AI calls will fail
npm run build        # next build
npm run start        # Supervised prod start (gateway + next start)
npm run stop         # Stop the supervised processes
npm run health       # Check gateway + app health via the control pipe
npm run setup:runtime # One-time: import/prepare the bundled OmniRoute runtime

npm run lint         # eslint .
npm run typecheck    # tsc --noEmit
npm test             # Run all tests (node:test runner via tsx)
```

Tests use the **Node built-in test runner** (`node:test` + `node:assert/strict`) executed through `tsx` — there is no Jest/Vitest.

```bash
npx tsx --test tests/voice-session.test.ts                 # a single test file
npx tsx --test --test-name-pattern "15s" tests/*.test.ts   # tests matching a name
```

Live/integration checks are opt-in and hit real services (never run in CI by default):
`npm run test:openai-live`, `npm run test:supabase-live`, `npm run test:agent-supabase-live`,
`npx tsx scripts/check-agent-features-live.ts`, `npx tsx scripts/check-weather-live.ts`.

Always run `npm run typecheck && npm test` before committing.

## Runtime supervision (the non-obvious part)

The app does not talk to model providers directly — it calls a **local OmniRoute gateway** (an OpenAI-compatible router) at `OMNIROUTE_BASE_URL` (default `http://127.0.0.1:20128/v1`). `scripts/system.mjs` is a supervisor that:
- starts/stops the bundled gateway under `services/omniroute/` (lock at `services/omniroute/runtime.lock.json`),
- health-checks both the gateway and the Next.js app over a platform control pipe/socket (named pipe on Windows, unix socket elsewhere),
- is the reason you use `npm run dev`/`start` instead of `next` directly.

Model routing is a fallback chain: `OMNIROUTE_MODEL` (default `gemini/gemini-3.1-flash-lite`) → `OMNIROUTE_FALLBACK_MODELS` (default `groq/openai/gpt-oss-20b`). In production the gateway runs remotely (Fly) and the Vercel app points `OMNIROUTE_BASE_URL` at it. A transient "Não consegui consultar o provedor de IA" is usually a gateway cold-start, not a code bug.

## Two operating modes

The whole app runs in one of two modes depending on env, resolved per-request:
- **Supabase mode** — `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set. Real auth (`@supabase/ssr`), per-user data with Row Level Security. `SUPABASE_SECRET_KEY` (service role) is used **only** by the reminders cron to read across users (bypasses RLS).
- **Local mode** — no Supabase env. In-memory/local fallback so the UI works without a backend.

`components/AssistantHub.tsx` receives `dataProvider` (`'supabase' | 'local'`) and `agentPilot` and branches accordingly.

## Agent pilot (`lib/agent/`)

Enabled by `AGENT_V1_ENABLED=true`. This is the "JARVIS" intent loop, kept separate from the older conversational flow.

- `orchestrator.ts` — bounded step loop: build context → call provider (function-calling) → run tool(s) → verify → repeat until an answer or step cap.
- `tool-registry.ts` + `tools/*` — the callable tools (`classes`, `personal-agenda`, `notice-schedule`, `course-knowledge`, `weather`). Tool schemas are **strict** OpenAI function schemas.
- `verifier.ts` — every **state-changing** tool must declare a `verify` step; the orchestrator only reports success after the effect is confirmed at the source. Don't add a mutating tool without a verifier.
- `pending-approval-store.ts` / `approval-policy.ts` — side-effectful actions (e.g. sending/scheduling WhatsApp) go through an approval flow; `SupabasePendingApprovalStore` keeps approvals server-side, inaccessible to the client, and they expire.
- `providers/` — `omniroute-provider.ts` is the default; `openai-responses.ts` / `openai-chat-completions.ts` are alternates. Per-model timeout is shorter than `OMNIROUTE_TIMEOUT_MS`.
- `client.ts` — the browser-side entry (`sendAgentTurn`, progress streaming) used by `AssistantHub`.

## Voice / TTS pipeline

- `lib/assistant/voice-session.ts` — Web Speech recognition session. Owns all timers/callbacks so late mobile events can't submit twice; merges Android's progressively-growing segments and de-dupes echoed adjacent words; bounded silence/watchdog/max-listen timers.
- `lib/tts/client.ts` — plays the TTS clip. **Mobile autoplay matters:** `unlock()` must run inside a real user gesture (tap mic / submit) to "bless" a single persistent `<audio>` element with a valid silent MP3, or mobile blocks the later `play()` and it falls back to the robotic browser voice. `AssistantHub` calls `primeSpeech()` for this.
- `lib/tts/server.ts` — synthesis. Provider chosen by `TTS_PROVIDER` (`elevenlabs` default | `google`). ElevenLabs needs `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID`; Google Cloud TTS needs `GOOGLE_TTS_API_KEY` (+ optional `GOOGLE_TTS_VOICE`, default `pt-BR-Neural2-B`). Missing key/voice → `tts_unconfigured`; upstream rejection → `tts_unavailable`. `app/api/tts/route.ts` requires auth and masks all failures as a generic 503 so the client falls back to the browser voice.

## Data, cron, push, WhatsApp, mobile

- `lib/data/` + `supabase/migrations/*.sql` — schema and per-user data; migrations enable RLS and revoke anon/authenticated access on sensitive tables (service role only).
- `app/api/cron/*` — `POST /api/cron/reminders` is protected by `CRON_SECRET` (sent via `x-cron-secret`); it uses the service role to fan out reminders.
- `lib/push/` + `app/api/push/*` + `public/sw.js` — Web Push (VAPID). The service worker is **network-first** and caches only icons (it does NOT cache the JS bundle, so stale-cache is not the cause of "old behavior on mobile").
- WhatsApp is a **mock by default**; set `WHATSAPP_MODE=cloud` + the three `WHATSAPP_*` creds for the real Cloud API (24h-window limitation).
- `mobile/` — Capacitor **static shell** (`webDir=dist`, no `server.url`): the installed app is a thin shell; the real assistant runs on the deployed website.

## Conventions

- Secrets must never use the `NEXT_PUBLIC_` prefix (that exposes them in the client bundle). Only publishable Supabase/VAPID keys are public.
- Timezone comes from `APP_TIMEZONE` (default `America/Cuiaba`).
- Prefer the existing Zod schemas and the strict-schema/verifier invariants when extending the agent.
