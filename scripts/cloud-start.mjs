/** One Render instance: verified Python actor service + built frontend gateway. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPublicServer } from './public-server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const backendPort = Number(process.env.SWARM_BACKEND_PORT || 8765);
const backendUrl = `http://127.0.0.1:${backendPort}`;
const backend = spawn(process.env.SWARM_PYTHON || 'python', ['-m', 'backend.ppo_service', '--port', String(backendPort)], {
  cwd: root, stdio: 'inherit', env: { ...process.env, PYTHONUNBUFFERED: '1' },
});
let server, stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  server?.closeAllConnections(); server?.close();
  backend.kill('SIGTERM');
  const timer = setTimeout(() => { backend.kill('SIGKILL'); process.exit(code); }, 5000);
  timer.unref();
  if (backend.exitCode !== null || backend.signalCode !== null) process.exit(code);
  else backend.once('exit', () => process.exit(code));
}
process.once('SIGTERM', () => stop());
process.once('SIGINT', () => stop());
backend.once('error', error => { console.error(error.message); stop(1); });
backend.once('exit', (code, signal) => {
  if (!stopping) { console.error(`PPO backend stopped (${signal || code})`); stop(1); }
});
try {
  const deadline = Date.now() + 120000;
  while (!stopping) {
    let ready = false;
    try {
      const response = await fetch(`${backendUrl}/api/ppo/health`, { signal: AbortSignal.timeout(2000) });
      ready = response.ok && (await response.json()).ready === true;
    } catch { /* The verified actors are still loading. */ }
    if (ready) break;
    if (Date.now() > deadline) throw new Error('PPO readiness timed out');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!stopping) {
    server = createPublicServer({ backend: backendUrl });
    server.on('error', error => { console.error(error.message); stop(1); });
    const port = Number(process.env.PORT || 3000), host = process.env.SWARM_BIND_HOST || '127.0.0.1';
    server.listen(port, host, () => console.log(`SWARM ready: ${host}:${port}; verified PPO CPU inference; four mission slots`));
  }
} catch (error) { console.error(error.message); stop(1); }
