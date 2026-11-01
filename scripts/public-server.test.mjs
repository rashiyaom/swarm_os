import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPublicServer } from './public-server.mjs';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
// Use raw HTTP for Host-header tests; fetch implementations may replace Host.
const raw = (url, options, body = '') => new Promise((resolve, reject) => {
  const req = http.request(url, options, res => {
    const chunks = []; res.on('data', chunk => chunks.push(chunk));
    res.on('end', () => resolve({ status: res.statusCode, json: () => JSON.parse(Buffer.concat(chunks).toString()) }));
  });
  req.on('error', reject); req.end(body);
});

test('public gateway serves built files and proxies PPO through the unchanged local contract', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'swarm-public-'));
  await writeFile(join(directory, 'index.html'), '<html>mission</html>');
  let received;
  const backend = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    received = { path: req.url, origin: req.headers.origin, authorization: req.headers.authorization, body: Buffer.concat(chunks).toString() };
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ready: true }));
  });
  const upstream = await listen(backend);
  const gateway = createPublicServer({ directory, backend: upstream });
  const url = await listen(gateway);
  try {
    assert.match(await (await fetch(url + '/?mode=observatory&explain=1')).text(), /mission/);
    const response = await raw(url + '/api/ppo/missions', { method: 'POST', headers: { Host: 'example-demo.trycloudflare.com', Origin: 'https://example-demo.trycloudflare.com', 'Content-Type': 'application/json', Authorization: 'must-not-forward' } }, '{"seed":10000}');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ready: true });
    assert.deepEqual(received, { path: '/api/ppo/missions', origin: 'http://127.0.0.1:5173', authorization: undefined, body: '{"seed":10000}' });
    assert.equal((await fetch(url + '/api/ppo/missions', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await raw(url, { headers: { Host: 'evil.example' } })).status, 403);
    assert.equal((await fetch(url + '/api/other')).status, 404);
    assert.equal((await fetch(url + '/api/ppo/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(16385) })).status, 413);
    assert.equal((await fetch(url + '/api/ppo/preview', { method: 'POST', body: '{}' })).status, 415);
    for (const path of ['/.git/config', '/scripts/swarm.mjs', '/src/app/App.tsx', '/%2e%2e%5csecret']) assert.equal((await fetch(url + path)).status, 404);
    if (process.platform !== 'win32') {
      const outside = join(directory, '..', 'swarm-outside-' + Date.now());
      await writeFile(outside, 'secret');
      try { await symlink(outside, join(directory, 'escape.txt')); assert.equal((await fetch(url + '/escape.txt')).status, 404); }
      finally { await rm(outside); }
    }
  } finally { await close(gateway); await close(backend); await rm(directory, { recursive: true }); }
});

test('gateway bounds API traffic and handles an offline backend', async () => {
  const gateway = createPublicServer({ backend: 'http://127.0.0.1:1', maxPerSecond: 1 });
  const url = await listen(gateway);
  try {
    assert.equal((await fetch(url + '/api/ppo/health')).status, 502);
    const limited = await fetch(url + '/api/ppo/health');
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '1');
  } finally { await close(gateway); }
});

test('Render accepts only the configured hostname and same-origin writes', async () => {
  const upstream = http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end('{"ready":true}'); });
  const backend = await listen(upstream);
  const gateway = createPublicServer({ backend, publicHosts: ['swarmos.onrender.com'] });
  const url = await listen(gateway);
  try {
    const headers = { Host: 'swarmos.onrender.com', Origin: 'https://swarmos.onrender.com', 'Content-Type': 'application/json' };
    assert.equal((await raw(url + '/api/ppo/missions', { method: 'POST', headers }, '{}')).status, 200);
    assert.equal((await raw(url + '/api/ppo/health', { headers: { Host: 'swarmos.onrender.com' } })).status, 200);
    assert.equal((await raw(url + '/api/ppo/missions', { method: 'POST', headers: { ...headers, Origin: 'https://other.onrender.com' } }, '{}')).status, 403);
    assert.equal((await raw(url + '/api/ppo/health', { headers: { Host: 'other.onrender.com' } })).status, 403);
  } finally { await close(gateway); await close(upstream); }
});
