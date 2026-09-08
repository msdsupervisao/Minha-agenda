export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ status: 'ok', service: 'minha-agenda' }, { headers: { 'cache-control': 'no-store' } });
}
