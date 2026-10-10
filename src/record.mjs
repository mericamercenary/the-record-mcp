/**
 * THE RECORD read-only tools. Pure: every read goes through `get(path)` on the public feed, so tests use a mock.
 * There are no write paths. Queries are never logged or stored.
 */
import constitution from '../data/constitution.json' with { type: 'json' };

export const FEED = 'https://raw.githubusercontent.com/mericamercenary/the-record-data/main/feed';
export const CTX = 'https://mericamercenary.github.io/the-record-web/ctx';
export const NOTE = 'Read-only record from THE RECORD; cite sources; no verdicts.';
const LIMIT = 10;
const U = 'UNKNOWN';

export const TOOLS = [
  { name: 'search_decisions', description: 'Search published U.S. government decisions (bills, resolutions, nominations, amendments) by words in the number, title, sponsor, or topic.', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Words to look for, for example "stock trading" or "H.R. 7008".' } }, required: ['query'], additionalProperties: false } },
  { name: 'get_decision', description: 'Get one decision by its THE RECORD id (for example us-congress-119-hr-7008), with every recorded vote and action and the official source links.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } },
  { name: 'find_representatives', description: 'Find members of Congress by state (two-letter code or name), by district (for example MN-07), or by name.', inputSchema: { type: 'object', properties: { state: { type: 'string' }, district: { type: 'string' }, name: { type: 'string' } }, additionalProperties: false } },
  { name: 'get_place', description: 'Get a state (two-letter code or 2-digit FIPS) or a congressional district (for example MN-07 or GEOID 2707): who represents it and the official sources.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } },
  { name: 'get_city', description: 'Get a U.S. city, town, or census designated place by name and state (for example "Bemidji", "MN") or by 7-digit Census GEOID: plain description, and local officials where THE RECORD has them.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, state: { type: 'string' }, geoid: { type: 'string' } }, additionalProperties: false } },
  { name: 'get_constitution_text', description: 'Get the exact text of one part of the U.S. Constitution (National Archives transcription). Ids like art1, art1-s8, amd1. Use id "list" for every id.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } },
];
export const TOOL_NAMES = TOOLS.map((t) => t.name);
for (const t of TOOLS) t.annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const fold = (s) => String(s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const str = (args, k) => (typeof args?.[k] === 'string' ? args[k].trim().slice(0, 200) : '');

/** Context page link, only once the pages are live (RECORD_CONTEXT_PAGES=1). */
export function contextLink(kind, id, env = globalThis.process?.env ?? {}) {
  return env.RECORD_CONTEXT_PAGES === '1' ? `${CTX}/${kind}/${id}.md` : null;
}

export function createRecord(get, env) {
  const cache = new Map();
  const load = (rel) => {
    if (!cache.has(rel)) cache.set(rel, get(rel).catch((e) => { cache.delete(rel); throw e; }));
    return cache.get(rel);
  };
  async function decisions() {
    const m = await load('manifest.json');
    const weeks = await Promise.all(m.weeks.map((w) => load(w.path)));
    const matters = new Map();
    const actions = [];
    for (const w of weeks) {
      for (const x of w.matters) matters.set(x.id, x);
      actions.push(...w.actions);
    }
    return { matters: [...matters.values()], actions, updated: m.generated_at ?? null };
  }
  async function reps() {
    const pm = await load('places/manifest.json');
    return load(`places/${pm.representatives.path}`);
  }
  async function cities() {
    return load('cities/manifest.json');
  }
  const summary = (m) => ({ id: m.id, number: m.number, title: m.title, status: m.status ?? U, last_action_at: m.last_action_at ?? U, source_url: m.source_url, context_page: contextLink('decision', m.id, env) });
  const member = (r) => (r ? { name: r.name, party: r.party ?? U, since: r.since ?? U, congress_url: r.congress_url ?? U, website: r.website ?? U } : { name: 'vacant or UNKNOWN' });
  const stateOf = (q, r) => {
    const f = fold(q);
    if (!f) return null;
    const all = [...r.senate.map((s) => ({ state: s.state, fips: s.state_fips })), ...r.house.map((h) => ({ state: h.state, fips: h.state_fips }))];
    const hit = all.find((s) => fold(s.state) === f || s.fips === q.trim());
    if (hit) return hit;
    const named = (r.state_names ?? STATE_NAMES).find(([, name]) => fold(name) === f);
    return named ? all.find((s) => s.state === named[0]) ?? null : null;
  };

  const tools = {
    async search_decisions(args) {
      const words = fold(str(args, 'query')).split(' ').filter(Boolean);
      if (!words.length) return { results: [], note: 'Type at least one word.' };
      const { matters } = await decisions();
      const scored = matters
        .map((m) => ({ m, hits: words.filter((w) => fold([m.number, m.title, m.official_title, (m.sponsors ?? []).join(' '), (m.topics ?? []).join(' '), m.id].join(' ')).includes(w)).length }))
        .filter((x) => x.hits > 0)
        .sort((a, b) => b.hits - a.hits || String(b.m.last_action_at).localeCompare(String(a.m.last_action_at)) || a.m.id.localeCompare(b.m.id));
      return { results: scored.slice(0, LIMIT).map((x) => summary(x.m)), total: scored.length };
    },
    async get_decision(args) {
      const id = str(args, 'id');
      const { matters, actions } = await decisions();
      const m = matters.find((x) => x.id === id);
      if (!m) return { error: 'UNKNOWN: no decision with that id in THE RECORD.' };
      return {
        decision: { ...summary(m), official_title: m.official_title ?? U, sponsors: m.sponsors?.length ? m.sponsors : U, topics: m.topics ?? [], last_action_text: m.last_action_text ?? U, chamber: m.chamber ?? U, session: m.session ?? U },
        actions: actions.filter((a) => a.matter_id === id).map((a) => ({ id: a.id, at: a.at, kind: a.kind, chamber: a.chamber ?? U, result: a.result ?? U, yeas: a.yeas ?? U, nays: a.nays ?? U, not_voting: a.nvs ?? U, source_url: a.source_url })),
      };
    },
    async find_representatives(args) {
      const r = await reps();
      const district = str(args, 'district').toUpperCase().replace(/\s+/g, '');
      const name = fold(str(args, 'name'));
      const state = str(args, 'state');
      const out = [];
      if (district) for (const h of r.house) if (h.seat.replace(/\s+/g, '') === district || h.geoid === district) out.push({ office: h.title, seat: h.seat, state: h.state, ...member(h.member), context_page: contextLink('place', h.geoid, env) });
      if (state) {
        const s = stateOf(state, r);
        if (!s) return { error: 'UNKNOWN: no state or territory by that name or code.' };
        for (const x of r.senate.filter((x) => x.state === s.state)) for (const sen of x.senators) out.push({ office: 'U.S. Senator', state: x.state, ...member(sen) });
        for (const h of r.house.filter((h) => h.state === s.state)) out.push({ office: h.title, seat: h.seat, state: h.state, ...member(h.member) });
      }
      if (name) {
        for (const x of r.senate) for (const sen of x.senators) if (fold(sen.name).includes(name)) out.push({ office: 'U.S. Senator', state: x.state, ...member(sen) });
        for (const h of r.house) if (h.member && fold(h.member.name).includes(name)) out.push({ office: h.title, seat: h.seat, state: h.state, ...member(h.member) });
      }
      if (!district && !state && !name) return { error: 'Give a state, a district, or a name.' };
      return { representatives: out.slice(0, 60), source: r.source, updated: r.generated_at ?? U };
    },
    async get_place(args) {
      const id = str(args, 'id').toUpperCase().replace(/\s+/g, '');
      const r = await reps();
      const h = r.house.find((x) => x.seat.replace(/\s+/g, '') === id || x.geoid === id);
      if (h) return { kind: 'congressional district', seat: h.seat, geoid: h.geoid, state: h.state, representative: member(h.member), senators: (r.senate.find((s) => s.state === h.state)?.senators ?? []).map(member), source: r.source, updated: r.generated_at ?? U, context_page: contextLink('place', h.geoid, env) };
      const s = stateOf(id, r);
      if (s) return { kind: 'state or territory', state: s.state, fips: s.fips, senators: (r.senate.find((x) => x.state === s.state)?.senators ?? []).map(member), house: r.house.filter((x) => x.state === s.state).map((x) => ({ seat: x.seat, title: x.title, ...member(x.member) })), source: r.source, updated: r.generated_at ?? U, context_page: contextLink('place', s.fips, env) };
      return { error: 'UNKNOWN: no state or district by that id. Try "MN" or "MN-07". Cities: use get_city.' };
    },
    async get_city(args) {
      const geoid = str(args, 'geoid');
      const name = fold(str(args, 'name'));
      const state = str(args, 'state').toUpperCase();
      const cm = await cities();
      const shards = cm.shards ?? [];
      const wantState = geoid ? null : state;
      const pick = shards.filter((s) => (wantState ? s.state === wantState : true));
      if (!geoid && !name) return { error: 'Give a city name and state, or a GEOID.' };
      if (!geoid && !wantState) return { error: 'Give the two-letter state too, so every state is searched the same way.' };
      const full = cm.full ? (await load(`cities/${cm.full.path}`)).cities : [];
      for (const s of pick) {
        const bundle = await load(`cities/${s.path}`);
        const hits = bundle.places.filter((p) => (geoid ? p.geoid === geoid : fold(p.name) === name));
        if (hits.length) {
          return {
            places: hits.slice(0, LIMIT).map((p) => {
              const f = full.find((c) => c.geoid === p.geoid);
              return { geoid: p.geoid, name: p.name, state: bundle.state, counties: p.counties ?? U, population: p.population ?? U, description: p.description ?? U, government: f?.government?.summary ?? U, officials: f ? f.officials.map((o) => ({ office: o.office, seat: o.seat ?? null, name: o.name ?? U, source_url: o.source?.url ?? U })) : U, sources: bundle.sources, context_page: contextLink('place', p.geoid, env) };
            }),
          };
        }
      }
      return { error: 'UNKNOWN: THE RECORD has no place by that name in that state.' };
    },
    async get_constitution_text(args) {
      const id = str(args, 'id');
      if (id === 'list') return { parts: constitution.parts.map((p) => ({ id: p.id, label: p.label })) };
      const p = constitution.parts.find((x) => x.id === id);
      if (!p) return { error: 'UNKNOWN: no part with that id. Call with id "list".' };
      return { id: p.id, label: p.label, text: p.text, source: constitution.source, source_url: constitution.source_url, context_page: contextLink('constitution', p.id, env) };
    },
  };

  return {
    async call(name, args) {
      if (!Object.hasOwn(tools, name)) return { error: `There is no tool named ${name}. This server only reads THE RECORD.` };
      const result = await tools[name](args && typeof args === 'object' && !Array.isArray(args) ? args : {});
      return { note: NOTE, ...result };
    },
  };
}

export function httpFeed(base = FEED, fetchImpl = globalThis.fetch) {
  return async (rel) => {
    const res = await fetchImpl(`${base}/${rel}`, { method: 'GET', headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`THE RECORD feed is unavailable right now (HTTP ${res.status}).`);
    return res.json();
  };
}

const STATE_NAMES = [['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],['DC','District of Columbia'],['PR','Puerto Rico'],['GU','Guam'],['VI','U.S. Virgin Islands'],['AS','American Samoa'],['MP','Northern Mariana Islands']];
