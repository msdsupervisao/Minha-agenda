import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWhatsAppHandoffUrl, normalizeWhatsAppPhone } from '../lib/assistant/whatsapp-handoff';

test('normaliza telefone brasileiro para o wa.me', () => {
  assert.equal(normalizeWhatsAppPhone('(65) 99999-0000'), '5565999990000');
  assert.equal(normalizeWhatsAppPhone('+55 (65) 99999-0000'), '5565999990000');
});

test('link de contato abre a conversa e inclui o texto', () => {
  const url = buildWhatsAppHandoffUrl({ recipientName: 'João', phone: '(65) 99999-0000', body: 'Olá, João!' });
  assert.match(url, /^https:\/\/wa\.me\/5565999990000\?/);
  assert.equal(new URL(url).searchParams.get('text'), 'Olá, João!');
});

test('link sem telefone abre o seletor para contatos e grupos', () => {
  const url = buildWhatsAppHandoffUrl({ recipientName: 'grupo dos pais', phone: null, body: 'Amanhã não tem aula.' });
  assert.match(url, /^https:\/\/api\.whatsapp\.com\/send\?/);
  assert.equal(new URL(url).searchParams.get('text'), 'Amanhã não tem aula.');
});
