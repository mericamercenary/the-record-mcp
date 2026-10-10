#!/usr/bin/env node
/** Remote HTTP option on Node: PORT=8787 npx the-record-mcp-http. Free hosts that run Node (for example Render free) can use this. */
import { createServer } from 'node:http';
import { createFetchHandler } from './http.mjs';

const handler = createFetchHandler();
const port = Number(process.env.PORT ?? 8787);
createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
  const response = await handler(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, () => process.stderr.write(`the-record-mcp listening on http://localhost:${port}/mcp\n`));
