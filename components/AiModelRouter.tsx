'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RECOMMENDED_GATEWAY_MODELS, type GatewayModelPreset } from '@/lib/agent/gateway-models';
import { AI_ROUTE_COOKIE_NAME, serializeAiRouteChainCookieValue } from '@/lib/assistant/ai-route';
import styles from './AiModelRouter.module.css';

const DEFAULT_CHAIN = ['gemini/gemini-3.1-flash-lite', 'groq/openai/gpt-oss-20b'];

const PRESETS = {
  estavel: ['gemini/gemini-3.1-flash-lite', 'groq/openai/gpt-oss-20b'],
  inverso: ['groq/openai/gpt-oss-20b', 'gemini/gemini-3.1-flash-lite'],
} as const;

export default function AiModelRouter({
  initialChain,
  activeProvider,
  allowOverride,
}: {
  initialChain: string[];
  activeProvider: string;
  allowOverride: boolean;
}) {
  const router = useRouter();
  const [chain, setChain] = useState<string[]>(initialChain.length ? initialChain : DEFAULT_CHAIN);
  const [saved, setSaved] = useState(false);

  const available = useMemo(() => RECOMMENDED_GATEWAY_MODELS.filter((model) => !chain.includes(model.slug)), [chain]);
  const activePresets = useMemo(() => presetMap(chain), [chain]);

  function applyPreset(name: keyof typeof PRESETS) {
    setSaved(false);
    setChain([...PRESETS[name]]);
  }

  function move(index: number, delta: -1 | 1) {
    const next = [...chain];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSaved(false);
    setChain(next);
  }

  function remove(slug: string) {
    setSaved(false);
    setChain((current) => current.filter((item) => item !== slug));
  }

  function add(model: GatewayModelPreset) {
    setSaved(false);
    setChain((current) => [...current, model.slug]);
  }

  function save() {
    if (!allowOverride) return;
    const value = serializeAiRouteChainCookieValue(chain.length ? chain : DEFAULT_CHAIN);
    document.cookie = `${AI_ROUTE_COOKIE_NAME}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
    setSaved(true);
    router.refresh();
  }

  return (
    <section className={styles.panel}>
      <div className={styles.headerRow}>
        <div>
          <h2>Rota do gateway</h2>
          <p>{allowOverride ? 'A ordem abaixo vale para este navegador quando o override estiver habilitado.' : 'Em produção, a ordem vem do ambiente; esta área fica somente para visualização.'}</p>
        </div>
        <button type="button" className={styles.secondary} onClick={save} disabled={!allowOverride}>
          {allowOverride ? 'Salvar seleção' : 'Bloqueado em produção'}
        </button>
      </div>

      <div className={styles.presets}>
        <button type="button" className={styles.preset} onClick={() => applyPreset('estavel')} disabled={!allowOverride}>Estável</button>
        <button type="button" className={styles.preset} onClick={() => applyPreset('inverso')} disabled={!allowOverride}>Fallback primeiro</button>
      </div>

      <div className={styles.section}>
        <strong>Ordem atual</strong>
        <ul className={styles.orderList}>
          {chain.map((slug, index) => {
            const model = RECOMMENDED_GATEWAY_MODELS.find((item) => item.slug === slug);
            return (
              <li key={`${slug}-${index}`} className={styles.orderItem}>
                <div>
                  <span>{model?.label || slug}</span>
                  <small>{index === 0 ? 'Primário' : `Fallback ${index}`}</small>
                </div>
                <div className={styles.actions}>
                  <button type="button" onClick={() => move(index, -1)} disabled={!allowOverride || index === 0}>↑</button>
                  <button type="button" onClick={() => move(index, 1)} disabled={!allowOverride || index === chain.length - 1}>↓</button>
                  <button type="button" onClick={() => remove(slug)} disabled={!allowOverride || chain.length === 1}>Remover</button>
                </div>
              </li>
            );
          })}
        </ul>
        <small className={styles.helper}>{saved ? 'Seleção salva no navegador.' : allowOverride ? 'Reordene e salve se quiser sobrepor o ambiente neste navegador.' : 'Produção: o ambiente continua mandando.'}</small>
      </div>

      <div className={styles.section}>
        <strong>Adicionar modelo do gateway</strong>
        <div className={styles.grid}>
          {available.map((model) => (
            <button key={model.slug} type="button" className={styles.modelCard} onClick={() => add(model)} disabled={!allowOverride}>
              <span>{model.label}</span>
              <small>{model.description}</small>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <strong>Presets ativos</strong>
        <p className={styles.helper}>{activePresets.length ? activePresets.join(' · ') : 'Nenhum preset conhecido.'}</p>
      </div>
    </section>
  );
}

function presetMap(chain: string[]) {
  return Object.entries(PRESETS)
    .filter(([, preset]) => preset.length === chain.length && preset.every((item, index) => item === chain[index]))
    .map(([name]) => name);
}
