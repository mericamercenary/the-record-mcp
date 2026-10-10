import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHandler } from '../src/protocol.mjs';
import { createFetchHandler } from '../src/http.mjs';
import { httpFeed, NOTE, TOOL_NAMES, TOOLS } from '../src/record.mjs';
import { mockFetch } from './fixtures.mjs';

const setup = (env = {}) => {
  const m = mockFetch();
  return { ...m, handle: createHandler({ get: httpFeed(undefined, m.fetchImpl), env }) };
};
const call = async (handle, name, args) => {
  const r = await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  return r.result.structuredContent;
};

test('exactly the six read-only tools, all annotated read-only', () => {
  assert.deepEqual(TOOL_NAMES, ['search_decisions', 'get_decision', 'find_representatives', 'get_place', 'get_city', 'get_constitution_text']);
  for (const t of TOOLS) {
    assert.equal(t.annotations.readOnlyHint, true);
    assert.equal(t.annotations.destructiveHint, false);
    assert.ok(!/create|update|delete|post|vote|flag|comment|write|set_|report|send/i.test(t.name), t.name);
  }
});

test('read-only enforcement: unknown or write-like tools are refused and nothing but GETs reach the feed', async () => {
  const { handle, calls } = setup();
  for (const name of ['post_comment', 'delete_decision', 'update_place', '__proto__', 'constructor', 'toString']) {
    const out = await call(handle, name, {});
    assert.match(out.error, /only reads THE RECORD/);
  }
  await call(handle, 'search_decisions', { query: 'stock' });
  await call(handle, 'get_city', { name: 'Bemidji', state: 'MN' });
  assert.ok(calls.length > 0);
  for (const c of calls) {
    assert.equal(c.method, 'GET');
    assert.equal(c.body, undefined);
    assert.ok(c.url.startsWith('https://raw.githubusercontent.com/mericamercenary/the-record-data/main/feed/'), c.url);
  }
  const r = await handle({ jsonrpc: '2.0', id: 9, method: 'resources/write', params: {} });
  assert.equal(r.error.code, -32601);
});

test('source has no write paths, no auth, no logging of queries, no storage', () => {
  for (const f of readdirSync(new URL('../src/', import.meta.url))) {
    const s = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    assert.ok(!/method:\s*'(POST|PUT|PATCH|DELETE)'/.test(s), `${f}: no write requests`);
    assert.ok(!/console\.(log|info|debug|warn|error)\(/.test(s), `${f}: no console logging`);
    assert.ok(!/writeFile|appendFile|createWriteStream|localStorage|indexedDB|caches\.open|KV|D1/.test(s), `${f}: no storage`);
    assert.ok(!/authorization|bearer|api[_-]?key|cookie/i.test(s.replace(/headers: \{ accept/, '')), `${f}: no auth`);
  }
  const stderrUse = readFileSync(new URL('../src/server.mjs', import.meta.url), 'utf8').match(/stderr\.write\(([^)]*)\)/g) ?? [];
  assert.ok(stderrUse.every((s) => s.includes('listening')), 'only a startup line, never a query');
});

test('decisions: search and get with votes, note, and UNKNOWN for gaps', async () => {
  const { handle } = setup();
  const s = await call(handle, 'search_decisions', { query: 'stock trading' });
  assert.equal(s.note, NOTE);
  assert.equal(s.results[0].id, 'us-congress-119-hr-7008');
  assert.equal(s.results[0].context_page, null, 'no context link until pages are live');
  const d = await call(handle, 'get_decision', { id: 'us-congress-119-hr-7008' });
  assert.equal(d.decision.official_title, 'UNKNOWN');
  assert.deepEqual([d.actions[0].yeas, d.actions[0].nays], [53, 47]);
  assert.match((await call(handle, 'get_decision', { id: 'nope' })).error, /^UNKNOWN/);
});

test('representatives, places, cities, constitution', async () => {
  const { handle } = setup({ RECORD_CONTEXT_PAGES: '1' });
  const reps = await call(handle, 'find_representatives', { state: 'Minnesota' });
  assert.deepEqual(reps.representatives.map((r) => r.name), ['Amy Klobuchar', 'Michelle Fischbach']);
  assert.equal((await call(handle, 'find_representatives', { name: 'fischbach' })).representatives[0].seat, 'MN-07');
  const place = await call(handle, 'get_place', { id: 'mn-07' });
  assert.equal(place.representative.website, 'UNKNOWN');
  assert.equal(place.context_page, 'https://mericamercenary.github.io/the-record-web/ctx/place/2707.md');
  assert.equal((await call(handle, 'get_place', { id: 'MN' })).fips, '27');
  const city = await call(handle, 'get_city', { name: 'Phoenix', state: 'AZ' });
  assert.equal(city.places[0].officials[0].name, 'Kate Gallego');
  assert.equal((await call(handle, 'get_city', { name: 'Bemidji', state: 'MN' })).places[0].officials, 'UNKNOWN');
  assert.match((await call(handle, 'get_city', { name: 'Bemidji' })).error, /two-letter state/);
  const amd1 = await call(handle, 'get_constitution_text', { id: 'amd1' });
  assert.match(amd1.text.join(' '), /Congress shall make no law/);
  assert.ok((await call(handle, 'get_constitution_text', { id: 'list' })).parts.length > 30);
});

test('protocol: initialize, tools/list, notifications, feed errors', async () => {
  const { handle } = setup();
  const init = await handle({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
  assert.equal(init.result.protocolVersion, '2025-03-26');
  assert.deepEqual(Object.keys(init.result.capabilities), ['tools']);
  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal((await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).result.tools.length, 6);
  const down = createHandler({ get: httpFeed(undefined, async () => new Response('x', { status: 503 })) });
  const r = await down({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search_decisions', arguments: { query: 'x' } } });
  assert.equal(r.result.isError, true);
  assert.match(r.result.content[0].text, /unavailable/);
});

test('HTTP transport: POST /mcp only, JSON, CORS, 202 for notifications', async () => {
  const m = mockFetch();
  const h = createFetchHandler({ get: httpFeed(undefined, m.fetchImpl), env: {} });
  const post = (body) => h(new Request('https://x.example/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const list = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).result.tools.length, 6);
  assert.equal((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
  assert.equal((await h(new Request('https://x.example/mcp', { method: 'DELETE' }))).status, 405);
  assert.equal((await h(new Request('https://x.example/other', { method: 'POST', body: '{}' }))).status, 404);
  assert.equal((await h(new Request('https://x.example/mcp', { method: 'OPTIONS' }))).headers.get('access-control-allow-origin'), '*');
});
