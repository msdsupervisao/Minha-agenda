import { createClient } from './server';
import { AuthService, type AuthUser } from '@/lib/auth/auth-service';

export type AuthenticatedUser = AuthUser;

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const supabase = createClient();
  return new AuthService(supabase.auth).currentUser();
}

export async function requireAuthenticatedUser() {
  const user = await getAuthenticatedUser();
  if (!user) throw new AuthenticationRequiredError();
  return user;
}

export class AuthenticationRequiredError extends Error {
  constructor() {
    super('Autenticação necessária.');
    this.name = 'AuthenticationRequiredError';
  }
}
