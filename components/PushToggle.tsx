'use client';

import { useEffect, useState } from 'react';
import { pushActivationErrorMessage, pushSubscribeErrorMessage, urlBase64ToUint8Array } from '@/lib/push/pure';
import styles from './screens/Screens.module.css';

type State = 'loading' | 'unsupported' | 'off' | 'on' | 'denied';

function timeoutError(name: string) {
  const error = new Error(name);
  error.name = name;
  return error;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorName: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(timeoutError(errorName)), timeoutMs);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

export default function PushToggle() {
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') { setState('denied'); return; }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'on' : 'off'))
      .catch(() => setState('off'));
  }, []);

  // Cria a inscrição na registration atual, removendo qualquer inscrição
  // pré-existente antes (ex.: criada com uma chave VAPID antiga).
  async function subscribeFresh(reg: ServiceWorkerRegistration, appServerKey: BufferSource) {
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      try { await fetch('/api/push/unsubscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: existing.endpoint }) }); } catch {}
      await existing.unsubscribe();
    }
    return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey });
  }

  async function enable() {
    setBusy(true); setMsg(null);
    let pendingSub: PushSubscription | null = null;
    try {
      setMsg('Aguardando a permissão do navegador…');
      const permission = await withTimeout(Notification.requestPermission(), 30_000, 'PermissionTimeout');
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        setMsg(permission === 'denied'
          ? 'A permissão de notificações está bloqueada nas configurações deste site.'
          : 'A permissão de notificações não foi concedida.');
        return;
      }
      // .trim() remove espaço/quebra de linha que às vezes entra ao colar a var no host.
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
      if (!key) { setMsg('Push não está configurado no servidor.'); return; }
      // Valida a chave ANTES de tentar inscrever: o Chrome só aceita um ponto
      // P-256 não comprimido (65 bytes, começa em 0x04). Se falhar aqui, a var
      // NEXT_PUBLIC_VAPID_PUBLIC_KEY no servidor está corrompida/truncada.
      let appServerKey: Uint8Array;
      try {
        appServerKey = urlBase64ToUint8Array(key);
        if (appServerKey.length !== 65 || appServerKey[0] !== 0x04) throw new Error('formato');
      } catch {
        setMsg(`Chave de push inválida no servidor (${key.length} caracteres). Reconfigure NEXT_PUBLIC_VAPID_PUBLIC_KEY.`);
        return;
      }

      setMsg('Preparando o serviço de notificações…');
      await withTimeout(navigator.serviceWorker.register('/sw.js'), 15_000, 'ServiceWorkerTimeout');
      const reg = await withTimeout(navigator.serviceWorker.ready, 15_000, 'ServiceWorkerTimeout');

      setMsg('Conectando ao serviço de notificações do Android…');
      const subscriptionPromise = subscribeFresh(reg, appServerKey as BufferSource);
      let sub: PushSubscription;
      try {
        sub = await withTimeout(subscriptionPromise, 25_000, 'PushSubscriptionTimeout');
      } catch (error) {
        // Se o Chrome concluir depois do timeout, remova a inscrição tardia para
        // evitar novamente um estado local que não existe no servidor.
        if ((error as { name?: string })?.name === 'PushSubscriptionTimeout') {
          void subscriptionPromise.then(async (lateSub) => { try { await lateSub.unsubscribe(); } catch {} }).catch(() => {});
        }
        throw error;
      }
      pendingSub = sub;

      setMsg('Salvando a inscrição neste aparelho…');
      const res = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) });
      if (!res.ok) {
        // Não deixe uma inscrição apenas no navegador: após recarregar, ela faria
        // a tela parecer ativada mesmo sem existir no banco.
        try { await sub.unsubscribe(); } catch {}
        setState('off');
        setMsg(pushSubscribeErrorMessage(res.status));
        return;
      }
      pendingSub = null;
      setState('on'); setMsg('Notificações ativadas neste aparelho.');
    } catch (err) {
      // fetch também pode falhar sem resposta; nesse caso vale a mesma garantia:
      // ou a inscrição foi persistida, ou ela não fica ativa só no aparelho.
      if (pendingSub) {
        try { await pendingSub.unsubscribe(); } catch {}
        setState('off');
      }
      const name = (err as { name?: string })?.name;
      setMsg(pushActivationErrorMessage(name));
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/unsubscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState('off'); setMsg('Notificações desativadas.');
    } catch {
      setMsg('Falha ao desativar.');
    } finally { setBusy(false); }
  }

  async function testNow() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      setMsg(res.ok ? `Teste enviado (${data.sent ?? 0} aparelho${(data.sent ?? 0) === 1 ? '' : 's'}).` : 'Falha ao enviar o teste.');
    } finally { setBusy(false); }
  }

  return (
    <div className={styles.item}>
      <div className={styles.itemRow}>
        <span className={styles.itemIcon}>◷</span>
        <div className={styles.itemMain}>
          <span className={styles.itemTitle}>Notificações de lembretes</span>
          <div className={styles.itemMeta}>
            {state === 'loading' && 'verificando…'}
            {state === 'unsupported' && 'Este navegador não suporta notificações push.'}
            {state === 'denied' && 'Permissão bloqueada — libere nas configurações do site.'}
            {state === 'off' && 'Receba um aviso quando um lembrete vencer.'}
            {state === 'on' && 'Ativadas neste aparelho.'}
          </div>
        </div>
        <div className={styles.itemActions}>
          {state === 'off' && <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={enable} disabled={busy}>Ativar</button>}
          {state === 'on' && (
            <>
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={testNow} disabled={busy}>Testar</button>
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={disable} disabled={busy}>Desativar</button>
            </>
          )}
        </div>
      </div>
      {msg && <div className={styles.edit}><div className={styles.itemMeta} style={{ margin: 0 }}>{msg}</div></div>}
    </div>
  );
}
