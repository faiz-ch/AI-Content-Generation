import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/*
 * Dev-only relay: mirrors the nginx /relay route of the Docker image so that
 * `npm run dev` behaves like production (no browser CORS problems).
 */
const ALLOWED_HOSTS = new Set([
  'api.tavily.com', 'generativelanguage.googleapis.com', 'api.anthropic.com',
  'api.openai.com', 'api.deepseek.com', 'api.groq.com', 'openrouter.ai'
]);

function devRelay() {
  return {
    name: 'flow-dev-relay',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/relay-health') { res.setHeader('Content-Type', 'text/plain'); res.end('ok'); return; }
        const m = req.url.match(/^\/relay\/([^/]+)(\/.*)?$/);
        if (!m) return next();
        const host = m[1];
        if (!ALLOWED_HOSTS.has(host)) { res.statusCode = 403; res.end('Target host not allowed'); return; }
        try {
          const chunks = [];
          for await (const c of req) chunks.push(c);
          const headers = {};
          for (const [k, v] of Object.entries(req.headers)) {
            if (!['host', 'origin', 'referer', 'connection', 'content-length', 'accept-encoding'].includes(k)) headers[k] = v;
          }
          const up = await fetch(`https://${host}${m[2] || '/'}`, {
            method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks)
          });
          res.statusCode = up.status;
          res.setHeader('Content-Type', up.headers.get('content-type') || 'application/json');
          res.end(Buffer.from(await up.arrayBuffer()));
        } catch (e) {
          res.statusCode = 502; res.end(JSON.stringify({ error: { message: 'Relay could not reach ' + host + ': ' + e.message } }));
        }
      });
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), devRelay()],
  server: { host: true, port: 5173 }
});
