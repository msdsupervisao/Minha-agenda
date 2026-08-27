import assert from 'node:assert/strict';
import test from 'node:test';
import { ConversationEngine } from '../lib/assistant/conversation-engine';
import { OperationalMemoryRepository, type StorageLike } from '../lib/assistant/memory';
import { extractAmount } from '../lib/assistant/parsing';
import type { ActionInterpreter, AssistantAction } from '../lib/assistant/types';

class TestStorage implements StorageLike {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function setup() {
  const repository = new OperationalMemoryRepository(new TestStorage());
  return { repository, engine: new ConversationEngine(repository) };
}

function reminderInterpreter(dueAt: string): ActionInterpreter {
  const action: AssistantAction = {
    id: 'timezone-reminder', intent: 'create_reminder', title: 'teste de fuso', summary: '', requiresConfirmation: false,
    data: { title: 'teste de fuso', dueAt },
  };
  return { async interpret() { return { action, provider: 'local', notice: 'Modo local ativo.' }; } };
}

test('resposta de lembrete usa o fuso explícito do dispositivo', async () => {
  const dueAt = '2026-08-21T12:00:00.000Z';
  const saoPaulo = new ConversationEngine(new OperationalMemoryRepository(new TestStorage()), undefined, reminderInterpreter(dueAt), 'America/Sao_Paulo');
  const cuiaba = new ConversationEngine(new OperationalMemoryRepository(new TestStorage()), undefined, reminderInterpreter(dueAt), 'America/Cuiaba');
  assert.match((await saoPaulo.process('crie o lembrete', 'text')).reply, /09:00/);
  assert.match((await cuiaba.process('crie o lembrete', 'text')).reply, /08:00/);
});

test('registra e consulta um gasto real da memória', async () => {
  const { engine, repository } = setup();
  const created = await engine.process('Gastei 30 reais em combustível.', 'voice');
  assert.equal(created.kind, 'executed');
  assert.match(created.reply, /R\$\s*30,00/);
  assert.equal(repository.read().expenses[0].source, 'voice');
  assert.equal(repository.read().expenses[0].category, 'combustível');

  const query = await engine.process('Quanto gastei com combustível hoje?', 'voice');
  assert.equal(query.kind, 'query');
  assert.match(query.reply, /R\$\s*30,00/);
});

test('aceita valor escrito por extenso', async () => {
  assert.equal(extractAmount('gastei trinta e cinco reais').amount, 35);
  const { engine, repository } = setup();
  await engine.process('Gastei trinta reais em combustível.', 'text');
  assert.equal(repository.read().expenses[0].amount, 30);
});

test('cria lembrete e reutiliza um contato conhecido', async () => {
  const { engine, repository } = setup();
  repository.createContact('João', 'Professor de Designer');
  const result = await engine.process('Me lembra amanhã às nove de falar com João.', 'voice');
  assert.equal(result.kind, 'executed');
  assert.equal(repository.read().reminders.length, 1);
  assert.equal(new Date(repository.read().reminders[0].dueAt).getHours(), 9);
  assert.equal(repository.read().reminders[0].contactId, repository.read().contacts[0].id);

  const agenda = await engine.process('O que tenho amanhã?', 'voice');
  assert.equal(agenda.kind, 'query');
  assert.match(agenda.reply, /falar com João/i);
});

test('continua lembrete incompleto sem exigir repetição', async () => {
  const { engine, repository } = setup();
  repository.createContact('João', 'Professor de Designer');
  const question = await engine.process('Me lembra de mandar mensagem para João amanhã.', 'voice');
  assert.equal(question.kind, 'question');
  assert.match(question.reply, /Que mensagem/i);
  const completed = await engine.process('Sobre a aula de Designer.', 'voice');
  assert.equal(completed.kind, 'executed');
  assert.match(repository.read().reminders[0].title, /aula de Designer/i);
});

test('pergunta quem é o contato novo e conserva a ação original', async () => {
  const { engine, repository } = setup();
  const question = await engine.process('Me lembra amanhã de falar com João.', 'voice');
  assert.equal(question.kind, 'question');
  assert.match(question.reply, /João/);
  const completed = await engine.process('O professor de Designer.', 'voice');
  assert.equal(completed.kind, 'executed');
  assert.equal(repository.read().contacts[0].role, 'professor');
  assert.equal(repository.read().contacts[0].className, 'Designer');
});

test('não escolhe silenciosamente entre nomes ambíguos', async () => {
  const { engine, repository } = setup();
  repository.createContact('João', 'Professor de Designer');
  repository.createContact('João', 'Aluno da turma de Fotografia');
  const ambiguous = await engine.process('Me lembra amanhã de falar com João.', 'voice');
  assert.equal(ambiguous.kind, 'question');
  assert.match(ambiguous.reply, /Encontrei 2 pessoas/);
  const chosen = await engine.process('1', 'voice');
  assert.equal(chosen.kind, 'executed');
  assert.equal(repository.read().reminders.length, 1);
});

test('faz perguntas para frase, data e horário ausentes quando necessário', async () => {
  const first = setup();
  const missingTitle = await first.engine.process('Me lembra amanhã.', 'voice');
  assert.equal(missingTitle.kind, 'question');
  assert.match(missingTitle.reply, /Do que/);
  assert.equal((await first.engine.process('Pagar a conta.', 'voice')).kind, 'executed');

  const second = setup();
  const missingDate = await second.engine.process('Marque uma reunião.', 'voice');
  assert.equal(missingDate.kind, 'question');
  assert.match(missingDate.reply, /Quando/);
  assert.equal((await second.engine.process('Amanhã às 14.', 'voice')).kind, 'executed');

  const third = setup();
  assert.equal((await third.engine.process('Me lembra amanhã de pagar a conta.', 'voice')).kind, 'executed');
  assert.equal(new Date(third.repository.read().reminders[0].dueAt).getHours(), 0);
});

test('registra anotação sem confundir professor genérico com contato', async () => {
  const { engine, repository } = setup();
  const result = await engine.process('Anota que preciso falar com o professor sobre a turma de Designer.', 'voice');
  assert.equal(result.kind, 'executed');
  assert.equal(repository.read().notes.length, 1);
  assert.equal(repository.read().pendingQuestion, null);
});

test('consulta tarefas atrasadas e próximo compromisso usando dados reais', async () => {
  const { engine, repository } = setup();
  const now = new Date().toISOString();
  repository.update((memory) => {
    memory.tasks.push({ id: 'late', userId: memory.userId, createdAt: now, updatedAt: now, title: 'Entregar relatório', status: 'open', dueAt: '2020-01-01T09:00:00.000Z', contactId: null });
    memory.events.push({ id: 'next', userId: memory.userId, createdAt: now, updatedAt: now, title: 'Reunião de planejamento', startsAt: '2099-01-01T09:00:00.000Z', endsAt: null, contactId: null });
  });
  assert.match((await engine.process('Quais tarefas estão atrasadas?', 'voice')).reply, /Entregar relatório/);
  assert.match((await engine.process('Qual é meu próximo compromisso?', 'voice')).reply, /Reunião de planejamento/);
});

test('prepara WhatsApp e entrega o rascunho ao navegador sem fingir que enviou', async () => {
  const { engine, repository } = setup();
  const contact = repository.createContact('João', 'Professor de Designer');
  repository.update((memory) => { memory.contacts.find((item) => item.id === contact.id)!.phone = '(65) 99999-0000'; });
  const prepared = await engine.process('Prepare uma mensagem para João dizendo que amanhã tem aula.', 'voice');
  assert.equal(prepared.kind, 'executed');
  assert.equal(repository.read().messages[0].status, 'prepared');

  const confirmation = await engine.process('Envie a mensagem.', 'voice');
  assert.equal(confirmation.kind, 'confirmation');
  assert.match(confirmation.reply, /Confirmar/);
  assert.equal(repository.read().messages[0].status, 'prepared');

  const sent = await engine.process('Certo.', 'voice');
  assert.equal(sent.kind, 'executed');
  assert.equal(repository.read().messages[0].status, 'prepared');
  assert.deepEqual(sent.whatsappHandoff, { recipientName: 'João', body: 'amanhã tem aula.', phone: '(65) 99999-0000' });
  assert.match(sent.reply, /toque em Enviar no WhatsApp/);
  assert.ok(repository.read().actionLogs.some((log) => log.intent === 'send_whatsapp_message'));
});

test('mensagem para grupo desconhecido abre o seletor do WhatsApp sem criar contato fictício', async () => {
  const { engine, repository } = setup();
  const confirmation = await engine.process('Mande no grupo dos pais dizendo que amanhã não tem aula.', 'voice');
  assert.equal(confirmation.kind, 'confirmation');
  assert.equal(repository.read().contacts.length, 0);

  const opened = await engine.process('Sim.', 'voice');
  assert.equal(opened.kind, 'executed');
  assert.deepEqual(opened.whatsappHandoff, { recipientName: 'grupo dos pais', body: 'amanhã não tem aula.', phone: null });
  assert.equal(repository.read().messages[0].status, 'prepared');
  assert.match(opened.reply, /Escolha grupo dos pais no WhatsApp/);
});

test('agenda mensagem futura para grupo e entrega o handoff ao aplicativo', async () => {
  const { engine, repository } = setup();
  const confirmation = await engine.process('Mande no grupo dos pais amanhã às 9 dizendo que teremos reunião.', 'text');
  assert.equal(confirmation.kind, 'confirmation');
  assert.equal(confirmation.action?.intent, 'schedule_whatsapp_message');
  assert.equal(confirmation.action?.data.recipientName, 'grupo dos pais');
  assert.equal(repository.read().contacts.length, 0);

  const scheduled = await engine.process('Confirmo.', 'text');
  assert.equal(scheduled.kind, 'executed');
  assert.equal(scheduled.whatsappHandoff, undefined);
  assert.equal(scheduled.scheduleHandoff?.recipientName, 'grupo dos pais');
  assert.equal(scheduled.scheduleHandoff?.body, 'teremos reunião.');
  assert.equal(scheduled.scheduleHandoff?.phone, null);
  assert.ok(Date.parse(String(scheduled.scheduleHandoff?.dueAt)) > Date.now());
  const scheduleLog = repository.read().actionLogs.find((log) => log.intent === 'schedule_whatsapp_message');
  assert.equal(scheduleLog?.status, 'pending');
  assert.equal(scheduled.scheduleHandoff?.actionLogId, scheduleLog?.id);
});

test('data mencionada no texto da mensagem não transforma envio imediato em agendamento', async () => {
  const { engine } = setup();
  const confirmation = await engine.process('Mande no grupo dos pais dizendo que amanhã não tem aula.', 'text');
  assert.equal(confirmation.kind, 'confirmation');
  assert.equal(confirmation.action?.intent, 'send_whatsapp_message');
});

test('agendamento incompleto pergunta mensagem e horário sem perder o destinatário', async () => {
  const { engine } = setup();
  const bodyQuestion = await engine.process('Agende uma mensagem para o grupo dos pais.', 'text');
  assert.equal(bodyQuestion.kind, 'question');
  assert.match(bodyQuestion.reply, /Que mensagem/i);
  const dateQuestion = await engine.process('A reunião mudou de horário.', 'text');
  assert.equal(dateQuestion.kind, 'question');
  assert.match(dateQuestion.reply, /dia e horário/i);
  const confirmation = await engine.process('Amanhã às 10.', 'text');
  assert.equal(confirmation.kind, 'confirmation');
  assert.equal(confirmation.action?.data.recipientName, 'grupo dos pais');
  assert.equal(confirmation.action?.data.body, 'A reunião mudou de horário.');
});

test('novo horário substitui o horário antigo enquanto o agendamento aguarda confirmação', async () => {
  const { engine } = setup();
  const first = await engine.process('Mande no grupo dos pais amanhã às 9 dizendo que teremos reunião.', 'text');
  assert.equal(first.kind, 'confirmation');
  const oldDueAt = String(first.action?.data.dueAt);

  const before = Date.now();
  const updated = await engine.process('Agende essa mensagem para daqui a 10 minutos.', 'text');
  const after = Date.now();
  assert.equal(updated.kind, 'confirmation');
  assert.notEqual(updated.action?.data.dueAt, oldDueAt);
  const updatedAt = Date.parse(String(updated.action?.data.dueAt));
  assert.ok(updatedAt >= before + 10 * 60_000);
  assert.ok(updatedAt <= after + 10 * 60_000);
  assert.equal(updated.action?.data.body, 'teremos reunião.');
});

test('corrige informação e desfaz a última ação reversível', async () => {
  const { engine, repository } = setup();
  await engine.process('Gastei 30 reais em combustível.', 'voice');
  const corrected = await engine.process('Anotei errado, era 50 reais.', 'voice');
  assert.match(corrected.reply, /30,00.*50,00/);
  assert.equal(repository.read().expenses[0].amount, 50);
  const undone = await engine.process('Desfaz isso.', 'voice');
  assert.equal(undone.kind, 'executed');
  assert.equal(repository.read().expenses[0].amount, 30);
});

test('não inventa uma ação para erro de transcrição', async () => {
  const { engine, repository } = setup();
  const result = await engine.process('gasstei trotta reus combustivi', 'voice');
  assert.equal(result.kind, 'error');
  assert.equal(repository.read().expenses.length, 0);
});

test('aceita comandos consecutivos e limita o contexto recente', async () => {
  const { engine, repository } = setup();
  await engine.process('Gastei 10 reais em café.', 'voice');
  await engine.process('Anota que preciso revisar a aula.', 'voice');
  await engine.process('Gastei 20 reais em combustível.', 'voice');
  assert.equal(repository.read().expenses.length, 2);
  assert.equal(repository.read().notes.length, 1);
  assert.ok(repository.read().recentConversation.length <= 12);
});
