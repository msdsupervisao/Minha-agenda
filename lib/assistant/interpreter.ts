import { extractAmount, contactNameFrom, parseDate, parseTime, combineDateTime, parseRelativeDateTime, stripRelativeDateTime } from './parsing';
import { parseRecurrence, stripRecurrence, firstRecurringDue } from './recurrence';
import { makeId, normalize, resolveRange, titleCase } from './memory';
import { appTimezone } from '../data/time';
import type { AssistantAction } from './types';

function action(intent: AssistantAction['intent'], title: string, summary: string, data: AssistantAction['data'] = {}, requiresConfirmation = false): AssistantAction {
  return { id: makeId(), intent, title, summary, data, requiresConfirmation };
}

export function interpretCommand(input: string, now = new Date(), tz = appTimezone()): AssistantAction | null {
  const text = input.trim();
  const clean = normalize(text);
  if (!clean) return null;

  if (/^(desfaz|desfaca|desfazer)(\s+isso)?[.!?]*$/.test(clean)) return action('undo_last_action', 'Desfazer', 'Vou desfazer a última ação.', {});

  if (/(?:anotei errado|corrige|corrija|na verdade|era)\b/.test(clean)) {
    const { amount } = extractAmount(text.replace(/^.*?(?:era|para|de)\s+/i, ''));
    if (amount != null) return action('correct_last_expense', 'Corrigir gasto', '', { amount });
  }

  if (/(quanto|qual o total|total).*(gastei|gasto)|quanto.*combustivel/.test(clean)) {
    const category = clean.match(/(?:com|em|de)\s+([\p{L}\s-]+?)(?:\s+(?:hoje|essa semana|esta semana|esse mes|este mes)|$)/u)?.[1]?.trim() || null;
    return action('read_expenses', 'Consultar gastos', '', { range: resolveRange(text), category });
  }

  if (/tarefas?.*atrasad|quais.*tarefas|tarefas?.*abertas/.test(clean)) return action('read_tasks', 'Consultar tarefas', '', { status: clean.includes('atrasad') ? 'overdue' : 'open', range: resolveRange(text) });
  if (/lembretes?/.test(clean) && /quais|o que|tenho|mostre/.test(clean)) return action('read_reminders', 'Consultar lembretes', '', { range: resolveRange(text) });
  if (/proximo compromisso|o que (?:eu )?tenho|minha agenda|compromissos?/.test(clean)) return action('read_events', 'Consultar agenda', '', { range: resolveRange(text), next: clean.includes('proximo') });
  if (/quem.*esperando.*responder|esperando resposta/.test(clean)) return action('search_memory', 'Consultar respostas', '', { query: 'awaiting_reply' });
  if (/^(quem|qual)\s+(?:e|é)?\s*[\p{L}]+/u.test(clean)) return action('search_contact', 'Localizar pessoa', '', { name: text.replace(/^(quem|qual)\s+(?:é|e)?\s*/i, '').replace(/[?!.]/g, '').trim() });

  if (/^(prepare|prepara|rascunhe|rascunha)\b/.test(clean) && /mensagem/.test(clean)) {
    const recipient = cleanRecipient(text.match(/(?:para|pro|pra)\s+(.+?)(?=\s+(?:dizendo|avisando|que)\b|\s*[:,]|$)/i)?.[1] || '');
    const body = text.match(/(?:dizendo|avisando)\s+(?:que\s+)?(.+)$/i)?.[1]?.trim() || text.match(/:\s*(.+)$/)?.[1]?.trim() || '';
    return action('prepare_whatsapp_message', `Mensagem para ${recipient || 'contato'}`, '', { recipientName: recipient, body });
  }

  if (/^(envie|manda|mande)\b/.test(clean)) {
    const recipient = cleanRecipient(text.match(/(?:para|pro|pra)\s+(.+?)(?=\s+(?:dizendo|avisando|que)\b|\s*[:,]|$)/i)?.[1] || '');
    const body = text.match(/(?:dizendo|avisando)\s+(?:que\s+)?(.+)$/i)?.[1]?.trim() || text.match(/:\s*(.+)$/)?.[1]?.trim() || '';
    return action('send_whatsapp_message', `Enviar mensagem${recipient ? ` para ${recipient}` : ''}`, '', { recipientName: recipient, body }, true);
  }

  if (/\b(gastei|gastar|paguei|anote que gastei)\b/.test(clean)) {
    const { amount, raw } = extractAmount(text);
    if (amount == null) return action('create_expense', 'Registrar gasto', '', { amount: null, currency: 'BRL', category: 'geral', occurredAt: now.toISOString() });
    const afterAmount = text.slice(Math.max(0, text.toLocaleLowerCase('pt-BR').indexOf(raw.toLocaleLowerCase('pt-BR')) + raw.length));
    const category = afterAmount.match(/(?:em|de|no|na)\s+(.+?)(?:[.!?]|$)/i)?.[1]?.replace(/\b(?:agora|hoje)\b/gi, '').trim() || 'geral';
    return action('create_expense', `Gasto em ${category}`, '', { amount, currency: 'BRL', category, occurredAt: now.toISOString() });
  }

  if (/^(?:me\s+)?lembr[ea](?:-me)?\b/.test(clean)) {
    const relative = parseRelativeDateTime(text, now);
    const recurrence = parseRecurrence(text);
    const date = parseDate(text, now, tz);
    const time = parseTime(text);
    let title = stripRecurrence(stripRelativeDateTime(text.replace(/^(?:me\s+)?lembr[ea](?:-me)?(?:\s+de)?\s*/i, '')))
      .replace(/(?:depois\s+de\s+amanhã|depois\s+de\s+amanha|amanhã|amanha|hoje|semana\s+que\s+vem|próxima\s+semana|proxima\s+semana|mês\s+que\s+vem|mes\s+que\s+vem|próximo\s+mês|proximo\s+mes)/gi, '')
      .replace(/\b(?:domingo|segunda(?:-feira)?|terça(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sábado|sabado)\b/gi, '')
      .replace(/(?:^|\s)(?:(?:às|as)\s+(?:\d{1,2}(?:[:h]\d{2}|h)?|uma|duas|três|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte)|a\s+\d{1,2}(?:[:h]\d{2}|h)?)(?=\s|$)/giu, ' ').trim().replace(/^de\s+/i, '').replace(/[,;.!?]+$/, '').trim();
    const contactName = contactNameFrom(title);
    if (/^(hoje|amanh[ãa])$/i.test(title)) title = '';
    const requiresMessageDetail = /^mandar\s+(?:uma\s+)?mensagem\s+(?:para|pro|pra)\s+[\p{L}'-]+\s*$/iu.test(title);
    const dueAt = relative
      ? relative.toISOString()
      : date
        ? combineDateTime(date, time, tz)
        : recurrence
          ? firstRecurringDue(recurrence, text, now, tz)
          : null;
    return action('create_reminder', title || 'Lembrete', '', { title, dueAt, contactName, requiresMessageDetail, recurrence: recurrence ?? null });
  }

  if (/^(?:anota|anote)\b/.test(clean)) {
    const content = text.replace(/^(?:anota|anote)(?:\s+que)?\s*/i, '').replace(/[.!?]+$/, '');
    return action('create_note', content || 'Anotação', '', { content, contactName: contactNameFrom(content) });
  }

  if (/^(?:crie\s+)?(?:uma\s+)?tarefa\b|^preciso\b/.test(clean)) {
    const title = stripRelativeDateTime(text.replace(/^(?:crie\s+)?(?:uma\s+)?tarefa(?:\s+para)?\s*|^preciso\s*/i, '')).replace(/[.!?]+$/, '');
    const relative = parseRelativeDateTime(text, now);
    const date = parseDate(text, now, tz);
    const dueAt = relative ? relative.toISOString() : (date ? combineDateTime(date, parseTime(text), tz) : null);
    return action('create_task', title, '', { title, dueAt, contactName: contactNameFrom(title) });
  }

  if (/^(?:agende|marque|crie)\b/.test(clean)) {
    const title = stripRelativeDateTime(text.replace(/^(?:agende|marque|crie)(?:\s+um)?\s*(?:evento|compromisso)?\s*/i, '')).replace(/[.!?]+$/, '');
    const relative = parseRelativeDateTime(text, now);
    const date = parseDate(text, now, tz);
    const startsAt = relative ? relative.toISOString() : (date ? combineDateTime(date, parseTime(text), tz) : null);
    return action('create_event', title, '', { title, startsAt, contactName: contactNameFrom(title) });
  }

  if (/^procure|^busque|^lembra de/.test(clean)) return action('search_memory', 'Pesquisar memória', '', { query: text.replace(/^(procure|busque|lembra de)\s*/i, '') });
  return null;
}

export function cleanContactDescription(text: string) {
  return titleCase(text.replace(/^(?:é|e|o|a|ele é|ela é)\s+/i, '').replace(/[.!?]+$/, '').trim());
}

function cleanRecipient(value: string) {
  return value.trim().replace(/^(?:o|a)\s+/i, '').trim();
}
