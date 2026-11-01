/** Built frontend + bounded PPO proxy. Expose this port, never the Vite dev server. */
import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, extname, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../frontend/dist', import.meta.url)));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.log': 'text/plain' };

export function createPublicServer({ directory = root, backend = 'http://127.0.0.1:8765', maxActive = 8, maxPerSecond = 40, publicHosts = [process.env.SWARM_PUBLIC_HOST, process.env.RENDER_EXTERNAL_HOSTNAME].filter(Boolean) } = {}) {
  let active = 0, count = 0, windowStart = Date.now();
  return http.createServer({ requestTimeout: 20000, headersTimeout: 10000, maxHeaderSize: 16384 }, async (req, res) => {
    const reply = (status, message) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error: message })); };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    try {
      const host = req.headers.host || '';
      // Quick Tunnel hostnames only; a named deployment must configure its exact hostname.
      const allowed = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) || /^[a-z0-9-]+\.trycloudflare\.com$/.test(host) || publicHosts.includes(host);
      if (!allowed) return reply(403, 'Unrecognized public hostname');
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname.startsWith('/api/')) {
        if (!/^\/api\/ppo\/(health|preview|missions(?:\/[A-Za-z0-9_-]+(?:\/step)?)?)$/.test(pathname)) return reply(404, 'Unknown API endpoint');
        if (!['GET', 'POST', 'DELETE'].includes(req.method)) return reply(405, 'Method not allowed');
        const origin = req.headers.origin;
        const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
        if ((origin && origin !== `${local ? 'http' : 'https'}://${host}`) || req.headers['sec-fetch-site'] === 'cross-site') return reply(403, 'Same-origin request required');
        if (Date.now() - windowStart >= 1000) { windowStart = Date.now(); count = 0; }
        if (++count > maxPerSecond || active >= maxActive) { res.setHeader('Retry-After', '1'); return reply(429, 'Demo busy; retry shortly'); }
        if (Number(req.headers['content-length'] || 0) > 16384) { req.resume(); return reply(413, 'Request too large'); }
        if (req.method === 'POST' && req.headers['content-type']?.split(';')[0] !== 'application/json') return reply(415, 'JSON required');
        active++;
        try {
          const chunks = []; let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 16384) { reply(413, 'Request too large'); return; }
            chunks.push(chunk);
          }
          // Validate the public origin above, then present the existing local contract.
          // Never forward visitor-supplied proxy, origin or authorization headers.
          const upstream = await fetch(`${backend}${pathname}`, {
            method: req.method,
            headers: { Origin: 'http://127.0.0.1:5173', ...(req.method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
            body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
            signal: AbortSignal.timeout(14000),
            redirect: 'error',
          });
          const body = Buffer.from(await upstream.arrayBuffer());
          res.writeHead(upstream.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(body);
        } finally { active--; }
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) return reply(405, 'Method not allowed');
      const decoded = decodeURIComponent(pathname);
      if (decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').some(part => part.startsWith('.') && part !== '')) return reply(404, 'Not found');
      const base = await realpath(directory);
      let file = resolve(base, '.' + (decoded === '/' ? '/index.html' : decoded));
      // Only the app route falls back to index.html; unknown files never expose sources.
      try { file = await realpath(file); } catch { return reply(404, 'Not found'); }
      const rel = relative(base, file);
      if (isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep) || !(await stat(file)).isFile()) return reply(404, 'Not found');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      if (!res.headersSent) reply(502, 'PPO backend unavailable or request failed; check the host terminal');
      else res.end();
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await stat(resolve(root, 'index.html')).catch(() => { throw new Error('Build first: npm --prefix frontend run build'); });
  const server = createPublicServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  const port = Number(process.env.PORT || 3000), host = process.env.SWARM_BIND_HOST || '127.0.0.1';
  server.listen(port, host, () => console.log(`Public demo gateway: http://${host}:${port}\nKeep PPO running on 8765. Tunnel ONLY the gateway port.`));
}
