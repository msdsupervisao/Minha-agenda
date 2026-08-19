export type AuthUser = { id: string; email: string | null };

type AuthClient = {
  signInWithPassword(credentials: { email: string; password: string }): Promise<{ data: { user?: { id: string; email?: string | null } | null }; error: { message?: string } | null }>;
  getClaims(): Promise<{ data: { claims?: Record<string, unknown> } | null; error: { message?: string } | null }>;
  signOut(): Promise<{ error: { message?: string } | null }>;
};

export class AuthService {
  constructor(private auth: AuthClient) {}

  async login(email: string, password: string): Promise<AuthUser> {
    const { data, error } = await this.auth.signInWithPassword({ email, password });
    if (error || !data.user?.id) throw new Error('E-mail ou senha inválidos.');
    return { id: data.user.id, email: data.user.email || null };
  }

  async currentUser(): Promise<AuthUser | null> {
    const { data, error } = await this.auth.getClaims();
    const subject = data?.claims?.sub;
    if (error || typeof subject !== 'string' || !subject) return null;
    return { id: subject, email: typeof data?.claims?.email === 'string' ? data.claims.email : null };
  }

  async logout() {
    const { error } = await this.auth.signOut();
    if (error) throw new Error('Não foi possível encerrar a sessão.');
  }
}
