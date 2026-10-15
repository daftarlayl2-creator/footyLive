/**
 * Supabase-compatible data client for EVIV Live (chat, predictions, admin).
 *
 * Exposes the subset of the supabase-js API the app uses — chainable,
 * awaitable query builders (`from().select().eq().order().limit()`),
 * `insert` / `update` / `delete`, and `channel().on('postgres_changes')` —
 * without pulling the SDK into the client bundle. Two interchangeable backends:
 *
 *  - **remote** — when `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
 *    are set, queries go to the project's PostgREST endpoint (`/rest/v1`) and
 *    realtime INSERTs are delivered by lightweight polling (visible tabs only).
 *  - **local** — without credentials, rows live in `localStorage` and realtime
 *    events are fanned out to every open tab through a `BroadcastChannel`. Chat
 *    and votes therefore work immediately (scoped to this browser) instead of
 *    silently discarding writes.
 *
 * Errors are *returned* as `{ data: null, error }`, exactly like supabase-js —
 * callers never need try/catch around a query.
 */

export type SupabaseError = {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
};

export type SupabaseRecord = {
  [key: string]: any;
};

export type SupabaseResult<T = any> = { data: T | null; error: SupabaseError | null };

export type SupabaseMode = 'local' | 'remote';

/** Payload handed to a `postgres_changes` listener. */
export type SupabaseRealtimePayload<T = SupabaseRecord> = {
  new: T;
  old: T;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  schema: string;
  table: string;
};

export type SupabaseRealtimeFilter = {
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  schema?: string;
  table?: string;
  filter?: string;
};

/** Realtime channel returned by `supabase.channel()`. */
export interface SupabaseRealtimeChannel {
  on(
    type: string,
    filter: SupabaseRealtimeFilter,
    callback: (payload: SupabaseRealtimePayload) => void
  ): SupabaseRealtimeChannel;
  subscribe(callback?: (status: string) => void): SupabaseRealtimeChannel;
  unsubscribe(): Promise<'ok'>;
}

/** Chainable + awaitable query builder (mirrors supabase-js). */
export interface SupabaseQueryBuilder<T = any> extends PromiseLike<SupabaseResult<T>> {
  select(columns?: string): SupabaseQueryBuilder<T>;
  insert(values: SupabaseRecord | SupabaseRecord[]): SupabaseQueryBuilder<T>;
  update(values: SupabaseRecord): SupabaseQueryBuilder<T>;
  delete(): SupabaseQueryBuilder<T>;
  eq(column: string, value: any): SupabaseQueryBuilder<T>;
  neq(column: string, value: any): SupabaseQueryBuilder<T>;
  gt(column: string, value: any): SupabaseQueryBuilder<T>;
  gte(column: string, value: any): SupabaseQueryBuilder<T>;
  lt(column: string, value: any): SupabaseQueryBuilder<T>;
  lte(column: string, value: any): SupabaseQueryBuilder<T>;
  in(column: string, values: any[]): SupabaseQueryBuilder<T>;
  order(column: string, options?: { ascending?: boolean; foreignTable?: string }): SupabaseQueryBuilder<T>;
  limit(count: number): SupabaseQueryBuilder<T>;
  maybeSingle(): SupabaseQueryBuilder<T>;
  single(): SupabaseQueryBuilder<T>;
  then<R1 = SupabaseResult<T>, R2 = never>(
    onfulfilled?: ((value: SupabaseResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: any) => R2 | PromiseLike<R2>) | null
  ): Promise<R1 | R2>;
  catch<R = never>(onrejected?: ((reason: any) => R | PromiseLike<R>) | null): Promise<SupabaseResult<T> | R>;
  finally(onfinally?: (() => void) | null): Promise<SupabaseResult<T>>;
}

export interface SupabaseStorage {
  upload(path: string, file: File | string, options?: any): Promise<{ data: any; error: SupabaseError | null }>;
  getPublicUrl(path: string): { data: { publicUrl: string }; error: null };
  remove(path: string): Promise<{ data: any; error: SupabaseError | null }>;
}

export interface SupabaseClient {
  /** Which backend serves this client. */
  readonly mode: SupabaseMode;
  from<T = any>(table: string): SupabaseQueryBuilder<T>;
  channel(name: string): SupabaseRealtimeChannel;
  removeChannel(channel: SupabaseRealtimeChannel): Promise<'ok'>;
  storage: {
    from(bucket: string): SupabaseStorage;
  };
}

/* -------------------------------------------------------------------------- */
/*  Query model                                                                */
/* -------------------------------------------------------------------------- */

export type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';

export interface QueryFilter {
  column: string;
  op: FilterOperator;
  value: any;
}

export interface QueryState {
  table: string;
  action: 'select' | 'insert' | 'update' | 'delete';
  columns: string;
  values?: SupabaseRecord | SupabaseRecord[];
  filters: QueryFilter[];
  orders: Array<{ column: string; ascending: boolean }>;
  limit?: number;
  single: 'none' | 'maybe' | 'single';
}

interface Backend {
  kind: SupabaseMode;
  execute(state: QueryState): Promise<SupabaseResult>;
  channel(name: string): SupabaseRealtimeChannel;
}

class QueryBuilder<T = any> implements SupabaseQueryBuilder<T> {
  private state: QueryState;
  private pending: Promise<SupabaseResult<T>> | null = null;

  constructor(private backend: Backend, table: string) {
    this.state = { table, action: 'select', columns: '*', filters: [], orders: [], single: 'none' };
  }

  select(columns = '*'): this {
    // After insert/update, `.select()` only asks for the representation back.
    if (this.state.action === 'select') this.state.columns = columns || '*';
    return this;
  }

  insert(values: SupabaseRecord | SupabaseRecord[]): this {
    this.state.action = 'insert';
    this.state.values = values;
    return this;
  }

  update(values: SupabaseRecord): this {
    this.state.action = 'update';
    this.state.values = values;
    return this;
  }

  delete(): this {
    this.state.action = 'delete';
    return this;
  }

  private filter(column: string, op: FilterOperator, value: any): this {
    this.state.filters.push({ column, op, value });
    return this;
  }

  eq(column: string, value: any) { return this.filter(column, 'eq', value); }
  neq(column: string, value: any) { return this.filter(column, 'neq', value); }
  gt(column: string, value: any) { return this.filter(column, 'gt', value); }
  gte(column: string, value: any) { return this.filter(column, 'gte', value); }
  lt(column: string, value: any) { return this.filter(column, 'lt', value); }
  lte(column: string, value: any) { return this.filter(column, 'lte', value); }
  in(column: string, values: any[]) { return this.filter(column, 'in', Array.isArray(values) ? values : [values]); }

  order(column: string, options?: { ascending?: boolean }): this {
    this.state.orders.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number): this {
    this.state.limit = Math.max(0, Math.floor(count));
    return this;
  }

  maybeSingle(): this {
    this.state.single = 'maybe';
    return this;
  }

  single(): this {
    this.state.single = 'single';
    return this;
  }

  /** Executes once, on first await/then; later awaits reuse the same result. */
  private run(): Promise<SupabaseResult<T>> {
    if (!this.pending) {
      this.pending = this.backend.execute({ ...this.state, filters: [...this.state.filters], orders: [...this.state.orders] })
        .catch((err: unknown) => ({ data: null, error: { message: errorMessage(err) } })) as Promise<SupabaseResult<T>>;
    }
    return this.pending;
  }

  then<R1 = SupabaseResult<T>, R2 = never>(
    onfulfilled?: ((value: SupabaseResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: any) => R2 | PromiseLike<R2>) | null
  ): Promise<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }

  catch<R = never>(onrejected?: ((reason: any) => R | PromiseLike<R>) | null): Promise<SupabaseResult<T> | R> {
    return this.run().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<SupabaseResult<T>> {
    return this.run().finally(onfinally);
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === 'string' ? err : 'Unknown error';
}

/* -------------------------------------------------------------------------- */
/*  Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

/** RFC 4122 v4 id — valid for both `uuid` and `text` primary keys. */
export function createRowId(): string {
  const c: Crypto | undefined = typeof globalThis !== 'undefined' ? (globalThis as any).crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Parses a realtime filter such as `match_id=eq.espn-401` (PostgREST syntax). */
export function parseRealtimeFilter(filter?: string | null): QueryFilter | null {
  if (!filter) return null;
  const match = /^([^=]+)=(eq|neq|gt|gte|lt|lte|in)\.(.*)$/.exec(filter.trim());
  if (!match) return null;
  const [, column, op, raw] = match;
  if (op === 'in') {
    const inner = raw.replace(/^\(/, '').replace(/\)$/, '');
    return { column, op, value: inner ? inner.split(',').map((v) => v.trim()) : [] };
  }
  return { column, op: op as FilterOperator, value: raw };
}

function comparable(value: any): number | string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const asString = String(value);
  if (asString !== '' && /^-?\d+(\.\d+)?$/.test(asString)) return Number(asString);
  return asString;
}

function sameValue(a: any, b: any): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return a === b;
  return String(a) === String(b);
}

export function rowMatches(row: SupabaseRecord, filters: QueryFilter[]): boolean {
  return filters.every(({ column, op, value }) => {
    const actual = row?.[column];
    if (op === 'eq') return sameValue(actual, value);
    if (op === 'neq') return !sameValue(actual, value);
    if (op === 'in') return (value as any[]).some((v) => sameValue(actual, v));
    const a = comparable(actual);
    const b = comparable(value);
    if (a === null || b === null) return false;
    const [x, y] = typeof a === typeof b ? [a, b] : [String(a), String(b)];
    if (op === 'gt') return x > y;
    if (op === 'gte') return x >= y;
    if (op === 'lt') return x < y;
    return x <= y;
  });
}

function project(row: SupabaseRecord, columns: string): SupabaseRecord {
  const list = columns.split(',').map((c) => c.trim()).filter(Boolean);
  if (list.length === 0 || list.includes('*')) return { ...row };
  const out: SupabaseRecord = {};
  for (const column of list) if (column in row) out[column] = row[column];
  return out;
}

function sortRows(rows: SupabaseRecord[], orders: QueryState['orders']): SupabaseRecord[] {
  if (orders.length === 0) return rows;
  return [...rows].sort((left, right) => {
    for (const { column, ascending } of orders) {
      const a = comparable(left[column]);
      const b = comparable(right[column]);
      if (a === b) continue;
      if (a === null) return 1;
      if (b === null) return -1;
      const [x, y] = typeof a === typeof b ? [a, b] : [String(a), String(b)];
      if (x < y) return ascending ? -1 : 1;
      if (x > y) return ascending ? 1 : -1;
    }
    return 0;
  });
}

function finalize(rows: SupabaseRecord[], state: QueryState): SupabaseResult {
  if (state.single === 'none') return { data: rows, error: null };
  if (state.single === 'single' && rows.length !== 1) {
    return { data: null, error: { message: `Expected a single row, found ${rows.length}`, code: 'PGRST116' } };
  }
  return { data: rows[0] ?? null, error: null };
}

/* -------------------------------------------------------------------------- */
/*  Local backend: localStorage tables + BroadcastChannel realtime             */
/* -------------------------------------------------------------------------- */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface LocalClientOptions {
  storage?: () => StorageLike | null;
  /** BroadcastChannel name used for cross-tab realtime; `null` disables it. */
  broadcastName?: string | null;
  /** Rows kept per table (oldest dropped first). */
  maxRowsPerTable?: number;
  keyPrefix?: string;
}

interface ChangeEvent {
  table: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: SupabaseRecord;
  old: SupabaseRecord;
  origin?: string;
}

interface Listener {
  table?: string;
  event: SupabaseRealtimeFilter['event'];
  filter: QueryFilter | null;
  callback: (payload: SupabaseRealtimePayload) => void;
}

class LocalRealtimeHub {
  private listeners = new Set<Listener>();
  private channel: BroadcastChannel | null = null;
  private readonly origin = createRowId();

  constructor(private broadcastName: string | null) {}

  add(listener: Listener) {
    this.listeners.add(listener);
    this.openChannel();
  }

  remove(listener: Listener) {
    this.listeners.delete(listener);
    if (this.listeners.size === 0) this.closeChannel();
  }

  publish(event: ChangeEvent) {
    const stamped = { ...event, origin: this.origin };
    this.dispatch(stamped);
    try {
      this.channel?.postMessage(stamped);
    } catch {
      // Structured clone failures are ignored; the local tab is already updated.
    }
  }

  private dispatch(event: ChangeEvent) {
    for (const listener of [...this.listeners]) {
      if (listener.table && listener.table !== event.table) continue;
      if (listener.event !== '*' && listener.event !== event.eventType) continue;
      const row = event.eventType === 'DELETE' ? event.old : event.new;
      if (listener.filter && !rowMatches(row, [listener.filter])) continue;
      try {
        listener.callback({ eventType: event.eventType, new: event.new, old: event.old, schema: 'public', table: event.table });
      } catch (err) {
        console.error('Realtime listener failed', err);
      }
    }
  }

  private openChannel() {
    if (this.channel || !this.broadcastName || typeof BroadcastChannel === 'undefined') return;
    try {
      const channel = new BroadcastChannel(this.broadcastName);
      channel.onmessage = (message: MessageEvent) => {
        const event = message.data as ChangeEvent;
        if (event && event.origin !== this.origin && typeof event.table === 'string') this.dispatch(event);
      };
      // Never keep a Node/test process alive just for this channel.
      (channel as unknown as { unref?: () => void }).unref?.();
      this.channel = channel;
    } catch {
      this.channel = null;
    }
  }

  private closeChannel() {
    try {
      this.channel?.close();
    } catch {
      // Already closed.
    }
    this.channel = null;
  }
}

function createListenerChannel(
  register: (listener: Listener) => void,
  unregister: (listener: Listener) => void,
  afterSubscribe?: (status: (s: string) => void) => void
): SupabaseRealtimeChannel {
  const listeners: Listener[] = [];
  let subscribed = false;

  const channel: SupabaseRealtimeChannel = {
    on(type, filter, callback) {
      if (type !== 'postgres_changes') return channel;
      const listener: Listener = {
        table: filter?.table,
        event: filter?.event || '*',
        filter: parseRealtimeFilter(filter?.filter),
        callback,
      };
      listeners.push(listener);
      if (subscribed) register(listener);
      return channel;
    },
    subscribe(callback) {
      if (!subscribed) {
        subscribed = true;
        listeners.forEach(register);
      }
      const report = (status: string) => {
        try {
          callback?.(status);
        } catch (err) {
          console.error('Realtime status callback failed', err);
        }
      };
      if (afterSubscribe) afterSubscribe(report);
      else queueMicrotask(() => report('SUBSCRIBED'));
      return channel;
    },
    async unsubscribe() {
      if (subscribed) {
        subscribed = false;
        listeners.forEach(unregister);
      }
      return 'ok';
    },
  };
  return channel;
}

function createLocalBackend(options: LocalClientOptions = {}): Backend {
  const prefix = options.keyPrefix ?? 'eviv:db:';
  const maxRows = options.maxRowsPerTable ?? 1500;
  const getStorage =
    options.storage ??
    (() => {
      try {
        return typeof window !== 'undefined' ? window.localStorage : null;
      } catch {
        return null;
      }
    });
  const memory = new Map<string, SupabaseRecord[]>();
  const hub = new LocalRealtimeHub(options.broadcastName === undefined ? 'eviv-local-db' : options.broadcastName);

  const read = (table: string): SupabaseRecord[] => {
    try {
      const raw = getStorage()?.getItem(prefix + table);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Corrupt entry or blocked storage: fall back to the in-memory copy.
    }
    return memory.get(table) ?? [];
  };

  const write = (table: string, rows: SupabaseRecord[]) => {
    const trimmed = rows.length > maxRows ? rows.slice(rows.length - maxRows) : rows;
    memory.set(table, trimmed);
    try {
      getStorage()?.setItem(prefix + table, JSON.stringify(trimmed));
    } catch {
      // Quota exceeded / private mode — the in-memory copy keeps the session working.
    }
  };

  async function execute(state: QueryState): Promise<SupabaseResult> {
    const rows = read(state.table);

    if (state.action === 'select') {
      let result = rows.filter((row) => rowMatches(row, state.filters));
      result = sortRows(result, state.orders);
      if (state.limit !== undefined) result = result.slice(0, state.limit);
      return finalize(result.map((row) => project(row, state.columns)), state);
    }

    if (state.action === 'insert') {
      const incoming = Array.isArray(state.values) ? state.values : state.values ? [state.values] : [];
      const inserted: SupabaseRecord[] = [];
      for (const value of incoming) {
        const row = {
          ...value,
          id: value?.id ?? createRowId(),
          created_at: value?.created_at ?? new Date().toISOString(),
        };
        if (rows.some((existing) => sameValue(existing.id, row.id))) {
          return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
        }
        rows.push(row);
        inserted.push(row);
      }
      write(state.table, rows);
      inserted.forEach((row) => hub.publish({ table: state.table, eventType: 'INSERT', new: row, old: {} }));
      return finalize(inserted, state);
    }

    if (state.action === 'update') {
      const changes = (state.values as SupabaseRecord) || {};
      const updated: Array<{ before: SupabaseRecord; after: SupabaseRecord }> = [];
      const next = rows.map((row) => {
        if (!rowMatches(row, state.filters)) return row;
        const after = { ...row, ...changes, id: row.id };
        updated.push({ before: row, after });
        return after;
      });
      if (updated.length) write(state.table, next);
      updated.forEach(({ before, after }) =>
        hub.publish({ table: state.table, eventType: 'UPDATE', new: after, old: before })
      );
      return finalize(updated.map((u) => u.after), state);
    }

    // delete
    const removed = rows.filter((row) => rowMatches(row, state.filters));
    if (removed.length) write(state.table, rows.filter((row) => !rowMatches(row, state.filters)));
    removed.forEach((row) => hub.publish({ table: state.table, eventType: 'DELETE', new: {}, old: row }));
    return finalize(removed, state);
  }

  return {
    kind: 'local',
    execute,
    channel: () =>
      createListenerChannel(
        (listener) => hub.add(listener),
        (listener) => hub.remove(listener)
      ),
  };
}

/* -------------------------------------------------------------------------- */
/*  Remote backend: PostgREST over fetch + polling realtime                    */
/* -------------------------------------------------------------------------- */

export interface RestClientOptions {
  fetch?: typeof fetch;
  /** Realtime polling interval (ms). */
  pollIntervalMs?: number;
  timeoutMs?: number;
  /**
   * Signed-in user's access token (Supabase Auth). Sent as the Bearer token so
   * row-level security sees `auth.uid()`; the anon key is used when it
   * returns nothing (guests, expired sessions).
   */
  getAccessToken?: () => string | null | undefined;
}

function encodeFilterValue(filter: QueryFilter): string {
  if (filter.op === 'in') {
    const list = (filter.value as any[]).map((v) => {
      const s = String(v);
      return /[,()"\s]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
    });
    return `in.(${list.join(',')})`;
  }
  return `${filter.op}.${filter.value === null ? 'null' : String(filter.value)}`;
}

/** Builds the PostgREST URL for a query (exported for tests). */
export function buildRestUrl(baseUrl: string, state: QueryState): string {
  const params = new URLSearchParams();
  if (state.action === 'select') params.set('select', state.columns || '*');
  for (const filter of state.filters) params.append(filter.column, encodeFilterValue(filter));
  if (state.orders.length) {
    params.set('order', state.orders.map((o) => `${o.column}.${o.ascending ? 'asc' : 'desc'}`).join(','));
  }
  if (state.limit !== undefined) params.set('limit', String(state.limit));
  else if (state.single !== 'none' && state.action === 'select') params.set('limit', '2');
  const query = params.toString();
  return `${baseUrl.replace(/\/+$/, '')}/rest/v1/${encodeURIComponent(state.table)}${query ? `?${query}` : ''}`;
}

function createRestBackend(url: string, anonKey: string, options: RestClientOptions = {}): Backend {
  const fetchImpl = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const pollMs = options.pollIntervalMs ?? 4000;
  const timeoutMs = options.timeoutMs ?? 8000;
  const baseHeaders: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    Accept: 'application/json',
  };

  const authHeaders = (): Record<string, string> => {
    let token: string | null | undefined = null;
    try {
      token = options.getAccessToken?.();
    } catch {
      token = null;
    }
    return token ? { ...baseHeaders, Authorization: `Bearer ${token}` } : { ...baseHeaders };
  };

  async function execute(state: QueryState): Promise<SupabaseResult> {
    const method =
      state.action === 'select' ? 'GET' : state.action === 'insert' ? 'POST' : state.action === 'update' ? 'PATCH' : 'DELETE';
    const headers: Record<string, string> = authHeaders();
    let body: string | undefined;
    if (state.action === 'insert' || state.action === 'update') {
      headers['Content-Type'] = 'application/json';
      headers.Prefer = 'return=representation';
      body = JSON.stringify(state.values ?? {});
    } else if (state.action === 'delete') {
      headers.Prefer = 'return=representation';
    }

    let response: Response;
    try {
      const signal =
        typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout === 'function'
          ? (AbortSignal as any).timeout(timeoutMs)
          : undefined;
      response = await fetchImpl(buildRestUrl(url, state), { method, headers, body, cache: 'no-store', signal });
    } catch (err) {
      return { data: null, error: { message: errorMessage(err) } };
    }

    const text = await response.text().catch(() => '');
    let json: any = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    if (!response.ok) {
      return {
        data: null,
        error: {
          message: json?.message || `Request failed with status ${response.status}`,
          details: json?.details,
          hint: json?.hint,
          code: json?.code ?? String(response.status),
        },
      };
    }
    const rows = Array.isArray(json) ? json : json ? [json] : [];
    return finalize(rows, state);
  }

  function pollingChannel(): SupabaseRealtimeChannel {
    const active = new Map<Listener, { cursor: string; seen: Set<string> }>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let report: ((status: string) => void) | null = null;
    let lastStatus = '';

    const setStatus = (status: string) => {
      if (status === lastStatus) return;
      lastStatus = status;
      report?.(status);
    };

    const tick = async () => {
      timer = null;
      if (active.size === 0) return;
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      if (!hidden) {
        for (const [listener, track] of active) {
          if (listener.event !== 'INSERT' && listener.event !== '*') continue;
          if (!listener.table) continue;
          const result = await execute({
            table: listener.table,
            action: 'select',
            columns: '*',
            filters: [
              ...(listener.filter ? [listener.filter] : []),
              { column: 'created_at', op: 'gt', value: track.cursor },
            ],
            orders: [{ column: 'created_at', ascending: true }],
            limit: 50,
            single: 'none',
          });
          if (!active.has(listener)) continue;
          if (result.error) {
            setStatus('CHANNEL_ERROR');
            continue;
          }
          setStatus('SUBSCRIBED');
          for (const row of (result.data as SupabaseRecord[]) || []) {
            const key = String(row?.id ?? JSON.stringify(row));
            if (row?.created_at && String(row.created_at) > track.cursor) track.cursor = String(row.created_at);
            if (track.seen.has(key)) continue;
            track.seen.add(key);
            if (track.seen.size > 4000) track.seen.clear();
            listener.callback({ eventType: 'INSERT', new: row, old: {}, schema: 'public', table: listener.table });
          }
        }
      }
      if (active.size > 0) timer = setTimeout(tick, pollMs);
    };

    const start = () => {
      if (!timer && active.size > 0) timer = setTimeout(tick, Math.min(pollMs, 1200));
    };

    return createListenerChannel(
      (listener) => {
        // Look back a minute to absorb clock skew; ids de-duplicate the overlap.
        active.set(listener, { cursor: new Date(Date.now() - 60_000).toISOString(), seen: new Set() });
        start();
      },
      (listener) => {
        active.delete(listener);
        if (active.size === 0 && timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      (statusCallback) => {
        report = statusCallback;
        start();
      }
    );
  }

  return { kind: 'remote', execute, channel: pollingChannel };
}

/* -------------------------------------------------------------------------- */
/*  Storage (no bucket backend yet — kept for API compatibility)               */
/* -------------------------------------------------------------------------- */

function placeholderStorage(bucket: string): SupabaseStorage {
  return {
    upload: async (path: string) => ({ data: { path }, error: null }),
    getPublicUrl: (path: string) => ({
      data: { publicUrl: `/storage/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}` },
      error: null,
    }),
    remove: async () => ({ data: null, error: null }),
  };
}

/* -------------------------------------------------------------------------- */
/*  Client factories                                                           */
/* -------------------------------------------------------------------------- */

function clientFromBackend(backend: Backend): SupabaseClient {
  return {
    mode: backend.kind,
    from: <T = any>(table: string) => new QueryBuilder<T>(backend, table),
    channel: (name: string) => backend.channel(name),
    removeChannel: async (channel: SupabaseRealtimeChannel) => {
      try {
        return await channel.unsubscribe();
      } catch {
        return 'ok';
      }
    },
    storage: { from: (bucket: string) => placeholderStorage(bucket) },
  };
}

export function createLocalClient(options?: LocalClientOptions): SupabaseClient {
  return clientFromBackend(createLocalBackend(options));
}

export function createRestClient(url: string, anonKey: string, options?: RestClientOptions): SupabaseClient {
  return clientFromBackend(createRestBackend(url, anonKey, options));
}

/** True when both Supabase env vars are present, i.e. a real backend is configured. */
function hasRealCredentials(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

let sharedClient: SupabaseClient | null = null;
let localClient: SupabaseClient | null = null;
let accessTokenProvider: (() => string | null | undefined) | null = null;

/**
 * Registers where the shared remote client reads the signed-in user's access
 * token from (lib/auth does this), without the data client importing auth.
 */
export function setSupabaseAccessTokenProvider(provider: (() => string | null | undefined) | null): void {
  accessTokenProvider = provider;
}

/** Supabase project URL + anon key when configured (shared with Supabase Auth). */
export function getSupabaseCredentials(): { url: string; anonKey: string } | null {
  return hasRealCredentials()
    ? { url: process.env.NEXT_PUBLIC_SUPABASE_URL as string, anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string }
    : null;
}

/** Browser-local client (localStorage + cross-tab realtime). Also the offline fallback. */
export function getLocalSupabase(): SupabaseClient {
  if (!localClient) localClient = createLocalClient();
  return localClient;
}

/** Shared client: remote PostgREST when configured, otherwise the local store. */
export function initSupabase(): SupabaseClient {
  if (sharedClient) return sharedClient;
  sharedClient = hasRealCredentials()
    ? createRestClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string, {
        getAccessToken: () => accessTokenProvider?.() ?? null,
      })
    : getLocalSupabase();
  return sharedClient;
}

export function getSupabaseMode(): SupabaseMode {
  return hasRealCredentials() ? 'remote' : 'local';
}

/**
 * True when no Supabase project is configured, i.e. data only lives in this
 * browser (admin tooling skips writes that must reach other users).
 */
export function isMockMode(): boolean {
  return !hasRealCredentials();
}
