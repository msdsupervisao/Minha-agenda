import test from 'node:test';
import assert from 'node:assert/strict';
import { volatileMemoryRepository, emptyMemory } from '../lib/assistant/memory';
import type { Message } from '../lib/assistant/types';
import {
  whatsappCloudConfig, whatsappSendAllowed, buildWhatsAppTextPayload,
  verifyWebhookChallenge, parseWhatsAppWebhook, normalizePhone, CloudWhatsAppService,
} from '../lib/assistant/whatsapp-cloud';

const CONFIG = { accessToken: 'tok', phoneNumberId: '123', verifyToken: 'verify-me' };

function repoWithOptInContact(recentInbound = true) {
  const repo = volatileMemoryRepository(emptyMemory());
  const created = repo.createContact('João', 'amigo');
  repo.update((mem) => {
    const c = mem.contacts.find((x) => x.id === created.id)!;
    c.phone = '+55 (11) 99999-0000';
    c.whatsappOptIn = true;
    c.lastInboundAt = recentInbound ? new Date().toISOString() : new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  });
  return { repo, contact: repo.read().contacts.find((x) => x.id === created.id)! };
}

test('whatsappCloudConfig: só válido com WHATSAPP_MODE=cloud e as três credenciais', () => {
  assert.equal(whatsappCloudConfig({}), null);
  assert.equal(whatsappCloudConfig({ WHATSAPP_MODE: 'cloud' }), null);
  assert.deepEqual(
    whatsappCloudConfig({ WHATSAPP_MODE: 'cloud', WHATSAPP_ACCESS_TOKEN: 'a', WHATSAPP_PHONE_NUMBER_ID: 'b', WHATSAPP_VERIFY_TOKEN: 'c' }),
    { accessToken: 'a', phoneNumberId: 'b', verifyToken: 'c' },
  );
});

test('normalizePhone e payload de texto', () => {
  assert.equal(normalizePhone('+55 (11) 99999-0000'), '5511999990000');
  const p = buildWhatsAppTextPayload('+55 (11) 99999-0000', 'Oi');
  assert.equal(p.to, '5511999990000');
  assert.equal(p.text.body, 'Oi');
  assert.equal(p.messaging_product, 'whatsapp');
});

test('verifyWebhookChallenge: token certo devolve challenge, errado nega', () => {
  assert.deepEqual(
    verifyWebhookChallenge(new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-me', 'hub.challenge': '42' }), 'verify-me'),
    { ok: true, challenge: '42' },
  );
  assert.equal(verifyWebhookChallenge(new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'errado', 'hub.challenge': '42' }), 'verify-me').ok, false);
});

test('parseWhatsAppWebhook: extrai inbound e statuses', () => {
  const payload = { entry: [{ changes: [{ value: {
    messages: [{ from: '5511999990000', text: { body: 'Oi' }, timestamp: '1756000000' }],
    statuses: [{ id: 'wamid.X', status: 'failed', timestamp: '1756000001' }],
  } }] }] };
  const r = parseWhatsAppWebhook(payload);
  assert.equal(r.inbound.length, 1);
  assert.equal(r.inbound[0].waId, '5511999990000');
  assert.equal(r.inbound[0].text, 'Oi');
  assert.equal(r.statuses[0].status, 'failed');
  assert.deepEqual(parseWhatsAppWebhook({}), { inbound: [], statuses: [] });
});

test('whatsappSendAllowed: bloqueia sem contato/opt-in/janela; permite dentro da janela', () => {
  const { contact } = repoWithOptInContact();
  const msgOk = { requiresTemplate: false } as Message;
  assert.equal(whatsappSendAllowed(msgOk, contact).allowed, true);
  assert.equal(whatsappSendAllowed(msgOk, null).allowed, false);
  assert.equal(whatsappSendAllowed({ requiresTemplate: true } as Message, contact).allowed, false);
  assert.equal(whatsappSendAllowed(msgOk, { ...contact, whatsappOptIn: false }).allowed, false);
  assert.equal(whatsappSendAllowed(msgOk, { ...contact, phone: null }).allowed, false);
});

test('CloudWhatsAppService.sendMessage: envia e marca sent com providerMessageId', async () => {
  const { repo, contact } = repoWithOptInContact();
  const calls: Array<{ url: string }> = [];
  const fetchOk = (async (url: string) => { calls.push({ url: String(url) }); return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.OK' }] }) }; }) as unknown as typeof fetch;
  const svc = new CloudWhatsAppService(repo, CONFIG, fetchOk);
  const prepared = await svc.prepareMessage(contact, 'João', 'Oi João');
  const sent = await svc.sendMessage(prepared.id);
  assert.equal(sent.status, 'sent');
  assert.equal(sent.providerMessageId, 'wamid.OK');
  assert.match(calls[0].url, /123\/messages/);
});

test('CloudWhatsAppService.sendMessage: fora da janela bloqueia ANTES de chamar a API', async () => {
  const { repo, contact } = repoWithOptInContact(false);
  let called = false;
  const fetchSpy = (async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; }) as unknown as typeof fetch;
  const svc = new CloudWhatsAppService(repo, CONFIG, fetchSpy);
  const prepared = await svc.prepareMessage(contact, 'João', 'Oi');
  await assert.rejects(() => svc.sendMessage(prepared.id), /janela de 24h/);
  assert.equal(called, false);
});

test('CloudWhatsAppService.sendMessage: erro da API marca failed', async () => {
  const { repo, contact } = repoWithOptInContact();
  const fetchErr = (async () => ({ ok: false, status: 400, text: async () => 'invalid recipient' })) as unknown as typeof fetch;
  const svc = new CloudWhatsAppService(repo, CONFIG, fetchErr);
  const prepared = await svc.prepareMessage(contact, 'João', 'Oi');
  await assert.rejects(() => svc.sendMessage(prepared.id), /400/);
  assert.equal(repo.read().messages.find((m) => m.id === prepared.id)!.status, 'failed');
});
