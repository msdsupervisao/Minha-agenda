import { cp, mkdir, readFile, access, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = join(root, 'services', 'omniroute', '.runtime');
const lock = JSON.parse(await readFile(join(root, 'services/omniroute/runtime.lock.json'), 'utf8'));
// Imports an existing, pinned installation. No download, install or rebuild.
const configPath = process.argv[2] || join(process.env.LOCALAPPDATA || '', 'OmniRouteLab/config/runtime.json');
const source = JSON.parse(await readFile(resolve(configPath), 'utf8'));
const pkg = JSON.parse(await readFile(join(source.workingDir, 'node_modules/omniroute/package.json'), 'utf8'));
const nodeVersion = execFileSync(source.nodePath, ['--version'], { encoding: 'utf8', windowsHide: true }).trim();
if (pkg.version !== lock.version || nodeVersion !== `v${lock.nodeVersion}`) {
  throw new Error('A versão do serviço ou do Node difere de services/omniroute/runtime.lock.json.');
}
await access(join(source.workingDir, 'node_modules/omniroute/dist/server-ws.mjs'));
await access(join(source.workingDir, 'node_modules/omniroute/dist/.build/next/BUILD_ID'));
try {
  await access(join(destination, 'import.json'));
  console.log('Runtime já incorporado. Nenhum arquivo substituído.');
} catch {
  await mkdir(destination, { recursive: true });
  console.log(`Incorporando OmniRoute ${lock.version} e Node ${lock.nodeVersion}...`);
  await cp(source.workingDir, join(destination, 'production'), {
    recursive: true, force: false, errorOnExist: true,
    filter: (path) => !['.env', '.env.local', '.git', 'logs'].includes(basename(path))
      && !/\.(sqlite|db|log)(-wal|-shm)?$/.test(path),
  });
  await mkdir(join(destination, 'node'), { recursive: true });
  await cp(source.nodePath, join(destination, 'node', basename(source.nodePath)), { errorOnExist: true, force: false });
  await cp(join(dirname(source.nodePath), 'LICENSE'), join(destination, 'node/LICENSE'), { errorOnExist: true, force: false });
  await cp(source.envFile, join(destination, 'runtime.env'), { errorOnExist: true, force: false });
  const entry = await readFile(join(destination, lock.entry));
  const node = await readFile(join(destination, 'node', basename(source.nodePath)));
  await writeFile(join(destination, 'import.json'), JSON.stringify({
    version: lock.version, nodeVersion: lock.nodeVersion,
    importedAt: new Date().toISOString(),
    entrySha256: createHash('sha256').update(entry).digest('hex'),
    nodeSha256: createHash('sha256').update(node).digest('hex'),
  }, null, 2));
  console.log('Serviço e runtime incorporados. Credenciais preservadas em arquivo ignorado pelo Git.');
}
