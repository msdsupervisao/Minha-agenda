import AssistantHub from '@/components/AssistantHub';
import { redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { getSupabasePublicConfig } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const dataConfig = getSupabasePublicConfig();
  if (!dataConfig.configured) return <AssistantHub dataProvider="local" />;
  const user = await getAuthenticatedUser();
  if (!user) redirect('/login');
  return <AssistantHub dataProvider="supabase" userEmail={user.email} />;
}
