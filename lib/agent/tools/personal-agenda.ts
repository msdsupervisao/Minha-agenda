import { z } from 'zod';
import type { PersonalAgendaStore } from '@/lib/data/agent-personal-repository';
import { wallTimeToUtcIso } from '@/lib/data/time';
import type { AgentExecutionContext, AgentTool, JsonObject, JsonValue } from '../contracts';

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const reminderSchema = z.object({
  title: z.string().trim().min(1).max(500),
  scheduleKind: z.enum(['local_datetime', 'delay_minutes']),
  localDueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).refine((value) => {
    const parsed = new Date(`${value}:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 16) === value;
  }, 'Data ou hora inexistente.').nullable(),
  delayMinutes: z.number().int().min(1).max(525600).nullable(),
}).strict().superRefine((value, ctx) => {
  if (!(value.scheduleKind === 'local_datetime' && value.localDueAt !== null && value.delayMinutes === null)
    && !(value.scheduleKind === 'delay_minutes' && value.delayMinutes !== null && value.localDueAt === null)) {
    ctx.addIssue({ code: 'custom', message: 'Informe somente o horário local ou somente o atraso em minutos.' });
  }
});

export function createPersonalAgendaTools(store: PersonalAgendaStore): AgentTool<JsonObject>[] {
  return [
    {
      name: 'list_agenda',
      description: 'Consulta eventos, tarefas com prazo e lembretes reais do usuário em um período de até 90 dias. fromDate e toDate são datas locais inclusivas no formato YYYY-MM-DD; use a data local atual para hoje. Não inclui tarefas sem prazo, aulas recorrentes das turmas ou calendário externo.',
      risk: 'read',
      inputSchema: z.object({ fromDate: calendarDate, toDate: calendarDate }).strict(),
      async execute(input, context) {
        const range = agendaRange(String(input.fromDate), String(input.toDate), context.timezone);
        const result = await store.agenda(context.userId, range.from, range.until);
        return { ...result, fromDate: input.fromDate, toDate: input.toDate, timezone: context.timezone, count: result.items.length, limitPerType: 200 };
      },
    },
    {
      name: 'find_contacts',
      description: 'Procura pessoas cadastradas por nome ou apelido. Usa somente dados reais e retorna possíveis correspondências; esclareça com o usuário se houver mais de uma pessoa. A busca é limitada aos primeiros 300 contatos por nome.',
      risk: 'read',
      inputSchema: z.object({ query: z.string().trim().min(1).max(200) }).strict(),
      async execute(input, context) {
        const contacts = await store.contacts(context.userId);
        const query = normalize(String(input.query));
        const matches = contacts.filter((contact) => [contact.name, ...contact.aliases].some((name) => normalize(name).includes(query)));
        return { matches: matches.slice(0, 10), count: matches.length, possiblyTruncated: contacts.length >= 300 || matches.length > 10 };
      },
    },
    {
      name: 'create_note',
      description: 'Salva uma anotação pessoal solicitada pelo usuário. Use para anotar conteúdo, sem enviar mensagem a outras pessoas. O resultado precisa ser relido no banco antes de confirmar que foi salvo.',
      risk: 'low',
      inputSchema: z.object({ content: z.string().trim().min(1).max(4000) }).strict(),
      async execute(input, context) {
        const id = await store.createNote(context.userId, String(input.content));
        return { id, content: input.content };
      },
      async verify(output, input, context) {
        const id = outputId(output);
        const saved = id ? await store.getNote(context.userId, id) : null;
        return { verified: saved?.id === id && saved?.content === input.content, evidence: saved };
      },
    },
    {
      name: 'create_reminder',
      description: 'Registra um lembrete pessoal na agenda. Para daqui a N minutos use delay_minutes com localDueAt=null; para data e hora use local_datetime e delayMinutes=null. A releitura comprova o registro, mas não comprova entrega de notificação nem agendamento no Android. Não use para avisos de turma ou envio de mensagens.',
      risk: 'low',
      inputSchema: reminderSchema,
      async execute(input, context) {
        const dueAt = reminderDueAt(input, context);
        if (Date.parse(dueAt) <= context.now.getTime()) throw new Error('reminder_time_must_be_future');
        const id = await store.createReminder(context.userId, String(input.title), dueAt);
        return { id, title: input.title, dueAt, deliveryConfirmed: false };
      },
      async verify(output, input, context) {
        const id = outputId(output);
        const saved = id ? await store.getReminder(context.userId, id) : null;
        return { verified: Boolean(saved && saved.id === id && saved.title === input.title && Date.parse(saved.dueAt) === Date.parse(reminderDueAt(input, context))), evidence: saved };
      },
    },
  ];
}

export function agendaRange(fromDate: string, toDate: string, timezone: string) {
  const first = new Date(`${fromDate}T00:00:00Z`);
  const last = new Date(`${toDate}T00:00:00Z`);
  if (!Number.isFinite(first.getTime()) || !Number.isFinite(last.getTime()) || first.toISOString().slice(0, 10) !== fromDate || last.toISOString().slice(0, 10) !== toDate
    || last.getTime() < first.getTime() || last.getTime() - first.getTime() > 89 * 86400000) throw new Error('invalid_agenda_period');
  const nextDate = new Date(last.getTime() + 86400000).toISOString().slice(0, 10);
  return { from: wallTimeToUtcIso(`${fromDate}T00:00`, timezone), until: wallTimeToUtcIso(`${nextDate}T00:00`, timezone) };
}

function reminderDueAt(input: JsonObject, context: AgentExecutionContext) {
  return input.scheduleKind === 'delay_minutes'
    ? new Date(context.now.getTime() + Number(input.delayMinutes) * 60000).toISOString()
    : wallTimeToUtcIso(String(input.localDueAt), context.timezone);
}

function outputId(output: JsonValue) { return output && typeof output === 'object' && !Array.isArray(output) && typeof output.id === 'string' ? output.id : null; }
function normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR'); }
