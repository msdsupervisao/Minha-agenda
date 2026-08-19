'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { AuthService } from '@/lib/auth/auth-service';

const LoginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(6).max(200),
});

export async function login(formData: FormData) {
  if (!getSupabasePublicConfig().configured) redirect('/login?error=not_configured');
  const parsed = LoginSchema.safeParse({ email: formData.get('email'), password: formData.get('password') });
  if (!parsed.success) redirect('/login?error=invalid_fields');
  const supabase = createClient();
  try { await new AuthService(supabase.auth).login(parsed.data.email, parsed.data.password); }
  catch { redirect('/login?error=invalid_credentials'); }
  redirect('/');
}
