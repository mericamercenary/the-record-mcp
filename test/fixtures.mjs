export const FEED = {
  'manifest.json': { generated_at: '2026-10-08T16:26:12-04:00', weeks: [{ path: 'weeks/w.json' }] },
  'weeks/w.json': {
    matters: [{ id: 'us-congress-119-hr-7008', number: 'H.R. 7008', title: 'Stock trading restrictions for Members of Congress', official_title: null, sponsors: ['Rep. Steil, Bryan [R-WI-1]'], topics: ['Securities'], status: 'Cloture Rejected', last_action_at: '2026-09-30T11:58:00-04:00', last_action_text: 'Cloture rejected 53-47', source_url: 'https://www.senate.gov/v253.xml', chamber: 'House', session: '119th' }],
    actions: [{ id: 'us-senate-119-2-roll-253', matter_id: 'us-congress-119-hr-7008', at: '2026-09-30T11:58:00-04:00', kind: 'voted', chamber: 'Senate', yeas: 53, nays: 47, nvs: 0, result: 'Rejected', source_url: 'https://www.senate.gov/v253.xml' }],
  },
  'places/manifest.json': { representatives: { path: 'reps.json' } },
  'places/reps.json': {
    generated_at: '2026-10-08T22:47:01-04:00',
    source: { name: 'Congress.gov', url: 'https://api.congress.gov/v3/member' },
    house: [{ seat: 'MN-07', state: 'MN', state_fips: '27', geoid: '2707', title: 'Representative', member: { name: 'Michelle Fischbach', party: 'Republican', since: 2021, congress_url: 'https://www.congress.gov/member/f', website: null } }],
    senate: [{ state: 'MN', state_fips: '27', senators: [{ name: 'Amy Klobuchar', party: 'Democratic', since: 2007, congress_url: 'https://www.congress.gov/member/k', website: null }] }],
  },
  'cities/manifest.json': { full: { path: 'full.json' }, shards: [{ state: 'MN', path: 'places-MN.json' }, { state: 'AZ', path: 'places-AZ.json' }] },
  'cities/full.json': { cities: [{ geoid: '0455000', government: { summary: 'Mayor and council.' }, officials: [{ office: 'Mayor', name: 'Kate Gallego', seat: null, source: { url: 'https://www.phoenix.gov/' } }] }] },
  'cities/places-MN.json': { state: 'MN', sources: [{ name: 'Census', url: 'https://www.census.gov/' }], places: [{ geoid: '2705068', name: 'Bemidji', description: 'Bemidji is a city.' }] },
  'cities/places-AZ.json': { state: 'AZ', sources: [{ name: 'Census', url: 'https://www.census.gov/' }], places: [{ geoid: '0455000', name: 'Phoenix', description: 'Phoenix is a city.' }] },
};

/** Mocked fetch: records every request and serves FEED; anything else is a test failure. */
export function mockFetch() {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body });
    const rel = String(url).replace('https://raw.githubusercontent.com/mericamercenary/the-record-data/main/feed/', '');
    if (!(rel in FEED)) return new Response('missing', { status: 404 });
    return new Response(JSON.stringify(FEED[rel]), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetchImpl, calls };
}
