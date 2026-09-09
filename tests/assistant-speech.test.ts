import assert from 'node:assert/strict';
import test from 'node:test';
import { selectPortugueseVoice, speechTextForReply, stripMarkdownForSpeech } from '../lib/assistant/speech';

test('prefere voz masculina brasileira sem confundir female com male', () => {
  assert.equal(selectPortugueseVoice([
    { lang: 'pt-BR', name: 'Google female' },
    { lang: 'pt-BR', name: 'Microsoft Antônio' },
  ])?.name, 'Microsoft Antônio');
  assert.equal(selectPortugueseVoice([{ lang: 'pt-BR', name: 'Google português' }])?.name, 'Google português');
});

test('aprovação e modelos nunca leem o corpo da mensagem; emojis não são narrados', () => {
  const reply = 'Enviar para Kids? 🚀 Segue mensagem: Amanhã temos aula!';
  assert.equal(speechTextForReply(reply, { approval: true }), 'Confira os detalhes na tela. Confirma esta ação?');
  assert.equal(speechTextForReply(reply, { message: true }), 'A mensagem está na tela para você conferir.');
  assert.equal(stripMarkdownForSpeech('🚀 💻 👨‍👩‍👧 👍🏽 🇧🇷 1️⃣ Hoje às 14:30, R$ 25.'), 'Hoje às 14:30, R$ 25.');
});

test('fala somente o horário na confirmação de agendamento', () => {
  const reply = 'Confirmar o agendamento para grupo Kids, em 27/08/2026, 15:19? “A mensagem completa fica na tela.”';
  assert.equal(speechTextForReply(reply), 'Horário do agendamento: 27/08/2026, 15:19.');
});

test('mantém respostas comuns completas', () => {
  assert.equal(speechTextForReply('Encontrei três turmas cadastradas.'), 'Encontrei três turmas cadastradas.');
});

test('prioriza voz pt-BR instalada', () => {
  const voice = selectPortugueseVoice([
    { lang: 'pt-PT', name: 'Microsoft Jorge' },
    { lang: 'pt-BR', name: 'Google português do Brasil' },
    { lang: 'en-US', name: 'Google US English' },
  ]);
  assert.equal(voice?.name, 'Google português do Brasil');
});

test('remove Markdown antes de falar', () => {
  assert.equal(
    stripMarkdownForSpeech('**Turmas:**\n* Design Gráfico\n* [Informática](https://example.com)\n`Kids Tecnologia`'),
    'Turmas: Design Gráfico. Informática. Kids Tecnologia',
  );
});

test('speechTextForReply remove asteriscos quando prepara a fala', () => {
  assert.equal(speechTextForReply('Você tem **3 tarefas** e *1 reunião*.'), 'Você tem 3 tarefas e 1 reunião.');
});
