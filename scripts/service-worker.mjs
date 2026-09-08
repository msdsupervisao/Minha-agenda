import { spawn, execFile } from 'node:child_process';

let child;
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  // Only the child retained by this worker can be terminated. IPC disconnect
  // also cleans up when the supervisor or its terminal closes unexpectedly.
  if (child && child.exitCode === null && child.signalCode === null) {
    if (process.platform === 'win32') {
      await new Promise((resolve) => execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, resolve));
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* child already exited */ }
    }
  }
  process.exit(0);
}
process.on('disconnect', () => void stop());
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
process.on('message', (message) => {
  if (message.stop) { void stop(); return; }
  if (child) return;
  child = spawn(message.node, message.args, {
    cwd: message.cwd, env: message.env, windowsHide: true,
    detached: process.platform !== 'win32', stdio: 'inherit',
  });
  process.send?.({ pid: child.pid });
  child.on('error', () => process.exit(1));
  child.on('exit', (code) => { if (!stopping) process.exit(code || 1); });
});
