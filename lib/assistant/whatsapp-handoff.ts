export type WhatsAppHandoff = {
  recipientName: string;
  body: string;
  phone: string | null;
};

export function normalizeWhatsAppPhone(value: string | null) {
  const digits = (value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.startsWith('0') && (digits.length === 11 || digits.length === 12)) return `55${digits.slice(1)}`;
  return digits;
}

export function buildWhatsAppHandoffUrl(handoff: WhatsAppHandoff) {
  const phone = normalizeWhatsAppPhone(handoff.phone);
  const query = new URLSearchParams({ text: handoff.body }).toString();
  return phone ? `https://wa.me/${phone}?${query}` : `https://api.whatsapp.com/send?${query}`;
}
