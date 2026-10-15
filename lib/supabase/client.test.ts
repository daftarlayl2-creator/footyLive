import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildRestUrl,
  createLocalClient,
  createRestClient,
  createRowId,
  parseRealtimeFilter,
  rowMatches,
  type QueryState,
} from './client';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => void map.set(key, value),
    map,
  };
}

let channelCounter = 0;
function localClient(storage = memoryStorage(), broadcastName: string | null = null) {
  return createLocalClient({ storage: () => storage, broadcastName });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('local supabase client', () => {
  it('supports the chained select/eq/order/limit query that used to throw a TypeError', async () => {
    const client = localClient();
    await client.from('match_messages').insert([
      { match_id: 'm1', message: 'second', created_at: '2026-10-15T10:00:02Z' },
      { match_id: 'm1', message: 'first', created_at: '2026-10-15T10:00:01Z' },
      { match_id: 'm2', message: 'other match', created_at: '2026-10-15T10:00:03Z' },
    ]);

    const { data, error } = await client
      .from('match_messages')
      .select('*')
      .eq('match_id', 'm1')
      .order('created_at', { ascending: true })
      .limit(10);

    expect(error).toBeNull();
    expect(data.map((row: any) => row.message)).toEqual(['first', 'second']);
  });

  it('assigns ids/timestamps on insert, projects columns and limits newest-first queries', async () => {
    const client = localClient();
    const inserted = await client.from('match_predictions').insert({ match_id: 'm1', prediction: 'home' });
    expect(inserted.error).toBeNull();
    expect(inserted.data[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof inserted.data[0].created_at).toBe('string');

    const projected = await client.from('match_predictions').select('prediction').eq('match_id', 'm1');
    expect(projected.data).toEqual([{ prediction: 'home' }]);

    await client.from('match_predictions').insert({ match_id: 'm1', prediction: 'away', created_at: '2999-01-01T00:00:00Z' });
    const newest = await client.from('match_predictions').select('*').order('created_at', { ascending: false }).limit(1);
    expect(newest.data[0].prediction).toBe('away');
  });

  it('persists rows in storage so a reload keeps the conversation', async () => {
    const storage = memoryStorage();
    await localClient(storage).from('match_messages').insert({ match_id: 'm1', message: 'hello' });
    const reloaded = localClient(storage);
    const { data } = await reloaded.from('match_messages').select('*').eq('match_id', 'm1');
    expect(data).toHaveLength(1);
    expect(data[0].message).toBe('hello');
  });

  it('delivers realtime INSERT events honouring the match filter', async () => {
    const client = localClient();
    const received: any[] = [];
    const status = vi.fn();
    const channel = client
      .channel('chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'match_messages', filter: 'match_id=eq.m1' }, (p) =>
        received.push(p)
      )
      .subscribe(status);

    await client.from('match_messages').insert({ match_id: 'm1', message: 'goal!' });
    await client.from('match_messages').insert({ match_id: 'm2', message: 'elsewhere' });
    await flush();

    expect(status).toHaveBeenCalledWith('SUBSCRIBED');
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ eventType: 'INSERT', table: 'match_messages', new: { message: 'goal!' } });

    await client.removeChannel(channel);
    await client.from('match_messages').insert({ match_id: 'm1', message: 'after unsubscribe' });
    expect(received).toHaveLength(1);
  });

  it('emits UPDATE events with old and new rows, and persists the change', async () => {
    const client = localClient();
    const { data } = await client.from('match_predictions').insert({ match_id: 'm1', prediction: 'home' });
    const updates: any[] = [];
    client
      .channel('votes')
      .on('postgres_changes', { event: 'UPDATE', table: 'match_predictions', filter: 'match_id=eq.m1' }, (p) => updates.push(p))
      .subscribe();

    const result = await client.from('match_predictions').update({ prediction: 'draw' }).eq('id', data[0].id);
    expect(result.data[0].prediction).toBe('draw');
    expect(updates).toHaveLength(1);
    expect(updates[0].old.prediction).toBe('home');
    expect(updates[0].new.prediction).toBe('draw');

    const { data: row } = await client.from('match_predictions').select('*').eq('id', data[0].id).maybeSingle();
    expect(row.prediction).toBe('draw');
  });

  it('fans realtime events out to other tabs through BroadcastChannel', async () => {
    const storage = memoryStorage();
    const name = `eviv-test-${(channelCounter += 1)}`;
    const tabA = localClient(storage, name);
    const tabB = localClient(storage, name);

    const received = new Promise<any>((resolve) => {
      tabB
        .channel('chat')
        .on('postgres_changes', { event: 'INSERT', table: 'match_messages', filter: 'match_id=eq.m9' }, resolve)
        .subscribe();
    });
    // Make sure tab A has its own channel open too (a real tab would).
    const channelA = tabA.channel('chat').on('postgres_changes', { event: '*', table: 'x' }, () => {}).subscribe();

    await tabA.from('match_messages').insert({ match_id: 'm9', message: 'from another tab' });
    const payload = await received;
    expect(payload.new.message).toBe('from another tab');
    await tabA.removeChannel(channelA);
  });

  it('stays compatible with promise-style callers (then/catch on the builder)', async () => {
    const client = localClient();
    const caught = vi.fn();
    await client.from('custom_streams').insert({ match_title: 'A vs B' }).catch(caught);
    const rows = await client
      .from('custom_streams')
      .select('*')
      .then(({ data }) => data);
    expect(rows).toHaveLength(1);
    expect(caught).not.toHaveBeenCalled();
  });

  it('rejects duplicate primary keys like Postgres and reports single() violations', async () => {
    const client = localClient();
    await client.from('t').insert({ id: 'same' });
    const dup = await client.from('t').insert({ id: 'same' });
    expect(dup.error?.code).toBe('23505');

    const missing = await client.from('t').select('*').eq('id', 'nope').maybeSingle();
    expect(missing).toEqual({ data: null, error: null });
    const strict = await client.from('t').select('*').eq('id', 'nope').single();
    expect(strict.error?.code).toBe('PGRST116');
  });
});

describe('query helpers', () => {
  it('parses PostgREST-style realtime filters', () => {
    expect(parseRealtimeFilter('match_id=eq.espn-401')).toEqual({ column: 'match_id', op: 'eq', value: 'espn-401' });
    expect(parseRealtimeFilter('prediction=in.(home,away)')).toEqual({ column: 'prediction', op: 'in', value: ['home', 'away'] });
    expect(parseRealtimeFilter('nonsense')).toBeNull();
    expect(parseRealtimeFilter(undefined)).toBeNull();
  });

  it('matches rows with numeric, string and ISO-date comparisons', () => {
    expect(rowMatches({ n: 5 }, [{ column: 'n', op: 'gt', value: '4' }])).toBe(true);
    expect(rowMatches({ at: '2026-10-15T10:00:00Z' }, [{ column: 'at', op: 'gt', value: '2026-10-15T09:59:59Z' }])).toBe(true);
    expect(rowMatches({ id: 7 }, [{ column: 'id', op: 'eq', value: '7' }])).toBe(true);
    expect(rowMatches({ p: 'draw' }, [{ column: 'p', op: 'in', value: ['home', 'away'] }])).toBe(false);
  });

  it('creates RFC 4122 v4 ids', () => {
    const id = createRowId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(createRowId()).not.toBe(id);
  });
});

describe('remote (PostgREST) client', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const state = (overrides: Partial<QueryState>): QueryState => ({
    table: 'match_messages',
    action: 'select',
    columns: '*',
    filters: [],
    orders: [],
    single: 'none',
    ...overrides,
  });

  it('builds PostgREST URLs with filters, ordering and limits', () => {
    const url = buildRestUrl(
      'https://abc.supabase.co/',
      state({
        filters: [
          { column: 'match_id', op: 'eq', value: 'espn-1' },
          { column: 'prediction', op: 'in', value: ['home', 'away'] },
        ],
        orders: [{ column: 'created_at', ascending: false }],
        limit: 100,
      })
    );
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://abc.supabase.co/rest/v1/match_messages');
    expect(parsed.searchParams.get('select')).toBe('*');
    expect(parsed.searchParams.get('match_id')).toBe('eq.espn-1');
    expect(parsed.searchParams.get('prediction')).toBe('in.(home,away)');
    expect(parsed.searchParams.get('order')).toBe('created_at.desc');
    expect(parsed.searchParams.get('limit')).toBe('100');
  });

  it('sends authenticated reads and representation-returning writes', async () => {
    const fetchMock = vi.fn(async (_url: any, init: any) => {
      if (init.method === 'POST') return new Response(JSON.stringify([{ id: 'r1', ...JSON.parse(init.body) }]), { status: 201 });
      return new Response(JSON.stringify([{ id: 'r0', message: 'hi' }]), { status: 200 });
    });
    const client = createRestClient('https://abc.supabase.co', 'anon-key', { fetch: fetchMock as any });

    const read = await client.from('match_messages').select('*').eq('match_id', 'espn-1');
    expect(read).toEqual({ data: [{ id: 'r0', message: 'hi' }], error: null });
    const [readUrl, readInit] = fetchMock.mock.calls[0];
    expect(String(readUrl)).toContain('/rest/v1/match_messages?select=*&match_id=eq.espn-1');
    expect(readInit.method).toBe('GET');
    expect(readInit.headers.apikey).toBe('anon-key');
    expect(readInit.headers.Authorization).toBe('Bearer anon-key');

    const write = await client.from('match_messages').insert({ match_id: 'espn-1', message: 'yo' });
    expect(write.error).toBeNull();
    expect(write.data[0]).toMatchObject({ id: 'r1', message: 'yo' });
    const [, writeInit] = fetchMock.mock.calls[1];
    expect(writeInit.method).toBe('POST');
    expect(writeInit.headers.Prefer).toBe('return=representation');
    expect(writeInit.headers['Content-Type']).toBe('application/json');
  });

  it('returns (never throws) PostgREST and network errors', async () => {
    const failing = createRestClient('https://abc.supabase.co', 'k', {
      fetch: (async () =>
        new Response(JSON.stringify({ message: 'relation "match_messages" does not exist', code: '42P01' }), {
          status: 404,
        })) as any,
    });
    const result = await failing.from('match_messages').select('*');
    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({ message: 'relation "match_messages" does not exist', code: '42P01' });

    const offline = createRestClient('https://abc.supabase.co', 'k', {
      fetch: (async () => {
        throw new TypeError('Failed to fetch');
      }) as any,
    });
    expect((await offline.from('match_messages').select('*')).error?.message).toBe('Failed to fetch');
  });

  it('polls for new rows and delivers each INSERT exactly once', async () => {
    const row = { id: 'n1', match_id: 'espn-1', message: 'new', created_at: new Date().toISOString() };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([row]), { status: 200 }));
    const client = createRestClient('https://abc.supabase.co', 'k', { fetch: fetchMock as any, pollIntervalMs: 15 });

    const received: any[] = [];
    const status = vi.fn();
    const channel = client
      .channel('chat')
      .on('postgres_changes', { event: 'INSERT', table: 'match_messages', filter: 'match_id=eq.espn-1' }, (p) => received.push(p))
      .subscribe(status);

    await new Promise((resolve) => setTimeout(resolve, 120));
    await client.removeChannel(channel);

    expect(received).toHaveLength(1);
    expect(received[0].new).toEqual(row);
    expect(status).toHaveBeenCalledWith('SUBSCRIBED');
    const pollUrl = new URL(String((fetchMock.mock.calls as any[])[0][0]));
    expect(pollUrl.searchParams.get('match_id')).toBe('eq.espn-1');
    expect(pollUrl.searchParams.get('created_at')).toMatch(/^gt\./);

    const callsAfterStop = fetchMock.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(fetchMock.mock.calls.length).toBe(callsAfterStop);
  });
});
