import { entrar, cadastrar } from './actions';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { erro?: string; aviso?: string };
}) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md relative">
        {/* Espiral de caderno — elemento de assinatura */}
        <div className="absolute -left-3 top-6 bottom-6 w-6 flex flex-col justify-between py-2 z-10">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="w-6 h-6 rounded-full bg-paper border-2 border-line shadow-inner"
            />
          ))}
        </div>

        <div className="bg-white/60 backdrop-blur-sm border border-line rounded-2xl shadow-sm px-8 pt-10 pb-8 pl-10">
          <p className="font-body text-xs uppercase tracking-[0.2em] text-clay mb-2">
            Página 01
          </p>
          <h1 className="font-display text-4xl font-semibold text-ink mb-1">
            Minha Agenda
          </h1>
          <p className="text-ink/60 text-sm mb-8">
            Tudo o que você precisa lembrar, guardado num só lugar.
          </p>

          {searchParams.erro && (
            <div className="mb-4 text-sm text-clay bg-clay/10 border border-clay/30 rounded-lg px-3 py-2">
              {searchParams.erro}
            </div>
          )}
          {searchParams.aviso && (
            <div className="mb-4 text-sm text-moss bg-moss/10 border border-moss/30 rounded-lg px-3 py-2">
              {searchParams.aviso}
            </div>
          )}

          <form className="space-y-4" action={entrar}>
            <Campo nome="email" tipo="email" rotulo="E-mail" />
            <Campo nome="senha" tipo="password" rotulo="Senha" />

            <button
              type="submit"
              className="w-full bg-ink text-paper font-body font-medium py-3 rounded-lg hover:bg-clay transition-colors"
            >
              Entrar
            </button>

            <button
              type="submit"
              formAction={cadastrar}
              className="w-full border border-line text-ink font-body font-medium py-3 rounded-lg hover:border-clay hover:text-clay transition-colors"
            >
              Criar conta
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

function Campo({
  nome,
  tipo,
  rotulo,
}: {
  nome: string;
  tipo: string;
  rotulo: string;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-ink/50 font-medium">
        {rotulo}
      </span>
      <input
        name={nome}
        type={tipo}
        required
        minLength={tipo === 'password' ? 6 : undefined}
        className="mt-1 w-full bg-paper border border-line rounded-lg px-3 py-2.5 text-ink focus:border-clay outline-none"
      />
    </label>
  );
}
