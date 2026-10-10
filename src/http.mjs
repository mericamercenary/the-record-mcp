/**
 * Streamable HTTP transport (stateless, JSON responses). A standard fetch handler, so it runs on
 * Cloudflare Workers (free plan), Deno Deploy, or Node (see server.mjs). POST /mcp only. No sign-in, no sessions, no logs.
 */
import { createHandler } from './protocol.mjs';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS', 'access-control-allow-headers': 'content-type, accept, mcp-protocol-version, mcp-session-id' };

export function createFetchHandler(opts) {
  const handle = createHandler(opts);
  return async function fetchHandler(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === '/' && request.method === 'GET') return new Response('THE RECORD read-only MCP server. POST JSON-RPC to /mcp.\n', { headers: { 'content-type': 'text/plain; charset=utf-8', ...CORS } });
    if (url.pathname !== '/mcp') return new Response('Not found\n', { status: 404, headers: CORS });
    if (request.method === 'GET') return new Response('This server does not stream. POST JSON-RPC to /mcp.\n', { status: 405, headers: { allow: 'POST', ...CORS } });
    if (request.method !== 'POST') return new Response('Method not allowed\n', { status: 405, headers: { allow: 'POST', ...CORS } });
    let msg;
    try {
      msg = await request.json();
    } catch {
      return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
    }
    const batch = Array.isArray(msg) ? msg : [msg];
    const out = (await Promise.all(batch.map(handle))).filter(Boolean);
    if (!out.length) return new Response(null, { status: 202, headers: CORS });
    return json(Array.isArray(msg) ? out : out[0]);
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS } });
}

/** Cloudflare Workers entry (wrangler.toml main = "src/http.mjs"). */
const worker = createFetchHandler({ env: {} });
export default { fetch: (request, env) => (env?.RECORD_CONTEXT_PAGES ? createFetchHandler({ env })(request) : worker(request)) };
