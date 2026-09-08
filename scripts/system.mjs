import { fork, spawn } from 'node:child_process';
import { createServer, createConnection } from 'node:net';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, open } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stateDir = join(root, '.runtime');
const serviceRoot = join(root, 'services/omniroute/.runtime');
const lock = JSON.parse(await readFile(join(root, 'services/omniroute/runtime.lock.json'), 'utf8'));
const suffix = createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0, 16);
const pipe = process.platform === 'win32' ? `\\\\.\\pipe\\minha-agenda-${suffix}` : join(stateDir, 'control.sock');
const command = process.argv[2] || 'dev';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function probe(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000), redirect: 'error' });
    const body = await response.json();
    return response.ok && body.status === 'ok';
  } catch { return false; }
}

async function control(action, quiet = false) {
  return new Promise((resolve) => {
    let reply = '';
    const socket = createConnection(pipe);
    socket.setTimeout(4000);
    socket.on('connect', () => socket.end(action));
    socket.on('data', (data) => { reply += data.toString(); });
    socket.on('end', () => { if (!quiet && reply) console.log(reply.trim()); resolve(reply || false); });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
  });
}

async function run() {
  await mkdir(stateDir, { recursive: true });
  if (command === 'stop') {
    if (!await control('stop')) console.log('Nenhuma instância unificada em execução.');
    return;
  }
  if (command === 'health') {
    const [gateway, web] = await Promise.all([
      probe(`http://127.0.0.1:${lock.port}/api/health`), probe('http://127.0.0.1:3000/api/health'),
    ]);
    console.log(JSON.stringify({ omniroute: gateway ? 'ok' : 'unavailable', minhaAgenda: web ? 'ok' : 'unavailable' }));
    process.exitCode = gateway && web ? 0 : 1;
    return;
  }
  if (command === 'background') {
    if (await control('status', true)) throw new Error('Supervisor já ativo. Consulte npm run health.');
    const log = await open(join(stateDir, 'system.log'), 'a');
    const processHandle = spawn(process.execPath, [fileURLToPath(import.meta.url), 'start'], {
      cwd: root, detached: true, windowsHide: true, stdio: ['ignore', log.fd, log.fd],
    });
    processHandle.unref();
    let launchError;
    let exited = false;
    processHandle.on('error', (error) => { launchError = error; });
    processHandle.on('exit', () => { exited = true; });
    await log.close();
    for (let attempt = 0; attempt < 60; attempt++) {
      if (launchError || exited) throw new Error('O supervisor não iniciou. Consulte .runtime/system.log.');
      const status = await control('status', true);
      if (status && JSON.parse(status).ready && await probe('http://127.0.0.1:3000/api/health')) {
        console.log('Minha Agenda disponível em http://127.0.0.1:3000 — serviços supervisionados.');
        return;
      }
      if (attempt % 10 === 0) console.log('Iniciando o sistema unificado...');
      await pause(1000);
    }
    throw new Error('Inicialização não concluída. Consulte .runtime/system.log.');
  }
  if (!['dev', 'start'].includes(command)) throw new Error('Use dev, start, background, stop ou health.');

  const node = join(serviceRoot, 'node', process.platform === 'win32' ? 'node.exe' : 'node');
  const imported = JSON.parse(await readFile(join(serviceRoot, 'import.json'), 'utf8'));
  if (imported.version !== lock.version || imported.nodeVersion !== lock.nodeVersion) throw new Error('Runtime incompatível com runtime.lock.json.');
  const appEnv = { ...parseEnv(await readFile(join(root, '.env.local'), 'utf8')), ...process.env };
  const gatewayEnv = parseEnv(await readFile(join(serviceRoot, 'runtime.env'), 'utf8'));
  const common = { ...process.env, PATH: `${dirname(node)}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`, NEXT_TELEMETRY_DISABLED: '1' };
  const specs = [
    {
      name: 'omniroute', url: `http://127.0.0.1:${lock.port}/api/health`,
      cwd: dirname(join(serviceRoot, lock.entry)),
      args: ['--max-old-space-size=1536', join(serviceRoot, lock.entry)],
      env: { ...common, ...gatewayEnv, HOST: lock.host, HOSTNAME: lock.host, OMNIROUTE_SERVER_HOST: lock.host, PORT: String(lock.port), NODE_ENV: 'production' },
    },
    {
      name: 'web', url: 'http://127.0.0.1:3000/api/health', cwd: root,
      args: ['--max-old-space-size=2048', join(root, 'node_modules/next/dist/bin/next'), command, '--hostname', '127.0.0.1', '--port', '3000'],
      env: { ...common, ...appEnv, NODE_ENV: command === 'dev' ? 'development' : 'production' },
    },
  ];
  const workers = new Map();
  let stopping = false;
  let healthTimer;
  const server = createServer({ allowHalfOpen: true }, (socket) => {
    let input = '';
    socket.on('data', (data) => { input += data.toString(); if (input.length > 32) socket.destroy(); });
    socket.on('end', () => {
      if (input === 'stop') { socket.end('Encerrando os serviços do Minha Agenda.'); void shutdown(); }
      else socket.end(JSON.stringify({ supervisor: process.pid, ready: workers.size === specs.length && [...workers.values()].every((worker) => worker.status === 'healthy'), mode: command }));
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(pipe, resolve); });
  function log(message) { console.log(`${new Date().toISOString()} ${message}`); }
  async function save() {
    await writeFile(join(stateDir, 'status.json'), JSON.stringify({
      supervisor: process.pid, mode: command, at: new Date().toISOString(),
      services: [...workers.values()].map((w) => ({ name: w.spec.name, pid: w.pid, status: w.status, restarts: w.restarts })),
    }, null, 2));
  }
  async function startWorker(spec, restarts = 0) {
    if (stopping) return;
    const file = await open(join(stateDir, `${spec.name}.log`), 'a');
    const child = fork(join(root, 'scripts/service-worker.mjs'), [], {
      execPath: node, execArgv: [], cwd: root, windowsHide: true,
      stdio: ['ignore', file.fd, file.fd, 'ipc'], env: common,
    });
    await file.close();
    const worker = { child, spec, pid: null, status: 'starting', restarts, failedProbes: 0, startedAt: Date.now() };
    workers.set(spec.name, worker);
    child.send({ node, ...spec });
    child.on('message', (message) => { if (message.pid) worker.pid = message.pid; });
    child.on('error', () => { log(`${spec.name}: falha ao iniciar.`); void shutdown(1); });
    child.on('exit', () => {
      if (stopping || worker.status === 'restarting') return;
      worker.status = 'stopped';
      void restart(worker);
    });
    log(`${spec.name}: iniciando.`);
    await save();
    return worker;
  }
  async function stopWorker(worker) {
    if (worker.child.exitCode !== null || worker.child.signalCode !== null) return;
    const done = new Promise((resolve) => worker.child.once('exit', resolve));
    if (worker.child.connected) worker.child.send({ stop: true });
    await Promise.race([done, pause(10000)]);
  }
  async function restart(worker) {
    if (stopping || worker.status === 'restarting') return;
    worker.status = 'restarting';
    if (worker.restarts >= 3) { log(`${worker.spec.name}: limite de recuperação atingido. Consulte o log do serviço.`); await shutdown(1); return; }
    await stopWorker(worker);
    await pause(1000 * (2 ** worker.restarts));
    if (!stopping) { log(`${worker.spec.name}: recuperação automática ${worker.restarts + 1}/3.`); await startWorker(worker.spec, worker.restarts + 1); }
  }
  async function shutdown(code = 0) {
    if (stopping) return;
    stopping = true;
    clearInterval(healthTimer);
    await Promise.all([...workers.values()].reverse().map(stopWorker));
    for (const w of workers.values()) w.status = 'stopped';
    await save();
    server.close();
    log('Sistema encerrado.');
    process.exit(code);
  }
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
  try {
    // A foreign listener is never adopted or killed by the launcher.
    for (const port of [lock.port, 3000]) {
      const free = createServer();
      await new Promise((resolve, reject) => { free.once('error', () => reject(new Error(`Porta ${port} ocupada. Encerre a instância anterior antes de iniciar o sistema.`))); free.listen(port, '127.0.0.1', resolve); });
      await new Promise((resolve) => free.close(resolve));
    }
    for (const spec of specs) {
      await startWorker(spec);
      let ready = false;
      for (let i = 0; i < 60 && !stopping; i++) {
        if (await probe(spec.url)) { ready = true; break; }
        if (i % 10 === 0) log(`${spec.name}: aguardando saúde...`);
        await pause(1000);
      }
      if (!ready) throw new Error(`${spec.name} não ficou saudável. Consulte .runtime/${spec.name}.log.`);
      workers.get(spec.name).status = 'healthy';
      log(`${spec.name}: saudável.`);
    }
    await save();
    log('Minha Agenda pronta: http://127.0.0.1:3000');
    let checking = false;
    healthTimer = setInterval(async () => {
      if (checking || stopping) return;
      checking = true;
      try {
        for (const worker of workers.values()) {
          if (worker.status === 'restarting') continue;
          if (await probe(worker.spec.url)) { worker.failedProbes = 0; worker.status = 'healthy'; }
          else if (Date.now() - worker.startedAt > 90000 && ++worker.failedProbes >= 3) await restart(worker);
        }
        await save();
      } finally { checking = false; }
    }, 10000);
  } catch (error) {
    log(error instanceof Error ? error.message : 'Falha ao iniciar o sistema.');
    await shutdown(1);
  }
}

run().catch((error) => { console.error(error.code === 'EADDRINUSE' ? 'Sistema já iniciado. Use npm run health ou npm run stop.' : error.message); process.exitCode = 1; });
