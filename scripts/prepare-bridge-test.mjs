import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Apenas gera um arquivo para revisão. Nunca executa SQL nem conecta ao Supabase.
const directory = join(process.cwd(), 'supabase', 'migrations');
const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
const guard = `do $$ begin
  if to_regclass('public.profiles') is not null or to_regclass('public.agent_bridge_jobs') is not null then
    raise exception 'Este banco já contém tabelas da Minha Agenda. Use apenas um projeto de teste vazio.';
  end if;
end $$;`;
const contents = await Promise.all(files.map(async (name) => `\n-- MIGRATION: ${name}\n${await readFile(join(directory, name), 'utf8')}`));
const outputDir = join(process.cwd(), '.runtime', 'bridge-test');
await mkdir(outputDir, { recursive: true });
await writeFile(join(outputDir, 'preparar-banco-de-teste.sql'), `-- Somente projeto novo e vazio de teste. Não executar na agenda em uso.\nbegin;\n${guard}\n${contents.join('\n')}\ncommit;\n`, 'utf8');
console.log(`Arquivo preparado com ${files.length} migrations: ${join(outputDir, 'preparar-banco-de-teste.sql')}`);
