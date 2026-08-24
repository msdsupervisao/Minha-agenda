import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { AuthService } from '@/lib/auth/auth-service';

export async function POST(request: Request) {
  if (getSupabasePublicConfig().configured) {
    const supabase = await createClient();
    await new AuthService(supabase.auth).logout();
  }
  return NextResponse.redirect(new URL('/login', request.url), 303);
}
