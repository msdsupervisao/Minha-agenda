import assert from 'node:assert/strict';
import test from 'node:test';
import { selectPortugueseVoice, speechTextForReply, stripMarkdownForSpeech } from '../lib/assistant/speech';

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
