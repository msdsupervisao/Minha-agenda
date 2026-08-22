'use client';

import { useEffect, useState } from 'react';
import { urlBase64ToUint8Array } from '@/lib/push/pure';
import styles from './screens/Screens.module.css';

type State = 'loading' | 'unsupported' | 'off' | 'on' | 'denied';

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

  async function enable() {
    setBusy(true); setMsg(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setState(permission === 'denied' ? 'denied' : 'off'); return; }
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) { setMsg('Push não está configurado no servidor.'); return; }
      const reg = await navigator.serviceWorker.ready;
      // Remove inscrição pré-existente (ex.: criada com uma chave VAPID antiga)
      // antes de recriar — senão o navegador lança InvalidStateError na troca de chave.
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        try { await fetch('/api/push/unsubscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: existing.endpoint }) }); } catch {}
        await existing.unsubscribe();
      }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) as BufferSource });
      const res = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) });
      if (!res.ok) { setMsg('Não foi possível registrar a inscrição.'); return; }
      setState('on'); setMsg('Notificações ativadas neste aparelho.');
    } catch (err) {
      const name = (err as { name?: string })?.name;
      setMsg(`Falha ao ativar as notificações${name ? ` (${name})` : ''}.`);
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
