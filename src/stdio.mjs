#!/usr/bin/env node
/** stdio transport for Claude Desktop and similar clients: one JSON-RPC message per line. Never logs queries. */
import { createInterface } from 'node:readline';
import { createHandler } from './protocol.mjs';

const handle = createHandler();
const rl = createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
    return;
  }
  const batch = Array.isArray(msg) ? msg : [msg];
  const out = (await Promise.all(batch.map(handle))).filter(Boolean);
  if (out.length) process.stdout.write(`${JSON.stringify(Array.isArray(msg) ? out : out[0])}\n`);
});
