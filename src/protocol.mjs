/** Minimal MCP (JSON-RPC 2.0) handler shared by the stdio and HTTP transports. Tools only; nothing is logged. */
import { createRecord, httpFeed, TOOLS } from './record.mjs';

export const SERVER_INFO = { name: 'the-record-mcp', version: '0.1.0' };
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const INSTRUCTIONS = 'Read-only tools over THE RECORD, a public record of U.S. government decisions, representatives, places, and the Constitution. Cite the source links in every result. Say UNKNOWN when a result says UNKNOWN or is missing. No party framing. Do not state whether anything is constitutional.';

export function createHandler({ get = httpFeed(), env } = {}) {
  const record = createRecord(get, env);
  return async function handle(msg) {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return msg?.id !== undefined ? err(msg.id ?? null, -32600, 'Invalid request') : null;
    const { id, method, params } = msg;
    const isNote = id === undefined;
    try {
      let result;
      switch (method) {
        case 'initialize': {
          const asked = params?.protocolVersion;
          result = { protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0], capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS };
          break;
        }
        case 'ping':
          result = {};
          break;
        case 'tools/list':
          result = { tools: TOOLS };
          break;
        case 'tools/call': {
          const out = await record.call(params?.name, params?.arguments);
          result = { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], structuredContent: out, isError: Boolean(out.error) };
          break;
        }
        default:
          if (method.startsWith('notifications/')) return null;
          return isNote ? null : err(id, -32601, `Method not found: ${method}. This server only lists and calls read-only tools.`);
      }
      return isNote ? null : { jsonrpc: '2.0', id, result };
    } catch (e) {
      return isNote ? null : { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: e instanceof Error ? e.message : 'THE RECORD feed is unavailable right now.' }], isError: true } };
    }
  };
}

function err(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}
