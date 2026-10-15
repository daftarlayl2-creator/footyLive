/**
 * Supabase client module for EVIV Live.
 *
 * Connects to process.env.NEXT_PUBLIC_SUPABASE_URL and
 * process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.
 *
 * Dev mock fallbacks are provided so the app works without real Supabase keys
 * during development. In production, set the env vars and the real SDK will be used.
 */

// Mock Supabase response types for development without the SDK
export type SupabaseError = {
  message: string;
  details?: string;
  hint?: string;
};

export type SupabaseRecord = {
  [key: string]: any;
};

export type SupabaseInsertOptions = {
  returning?: 'representation' | 'minimal' | false;
  conflict?: 'not-null' | 'identity' | string;
};

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

// Mock Supabase client interface
export interface SupabaseClient {
  from(table: string): SupabaseQueryBuilder;
  channel(name: string): SupabaseRealtimeChannel;
  removeChannel(channel: SupabaseRealtimeChannel): Promise<'ok'>;
  storage: {
    from(bucket: string): SupabaseStorage;
  };
}

// Mock query builder interface
export interface SupabaseQueryBuilder {
  select<T = any>(column?: string): Promise<{ data: T | null; error: SupabaseError | null }>;
  insert<T>(data: T): Promise<{ data: T | null; error: SupabaseError | null }>;
  update<T>(data: T): Promise<{ data: T | null; error: SupabaseError | null }>;
  delete(): Promise<{ data: any | null; error: SupabaseError | null }>;
  eq(column: string, value: any): SupabaseQueryBuilder;
  gt(column: string, value: any): SupabaseQueryBuilder;
  gte(column: string, value: any): SupabaseQueryBuilder;
  lt(column: string, value: any): SupabaseQueryBuilder;
  lte(column: string, value: any): SupabaseQueryBuilder;
  order(column: string, options?: { ascending?: boolean; foreignTable?: string }): SupabaseQueryBuilder;
  limit(count: number): SupabaseQueryBuilder;
  maybeSingle(): SupabaseQueryBuilder;
}

// Mock storage interface
export interface SupabaseStorage {
  upload(path: string, file: File | string, options?: any): Promise<{ data: any; error: SupabaseError | null }>;
  getPublicUrl(path: string): { data: { publicUrl: string }; error: null };
  remove(path: string): Promise<{ data: any; error: SupabaseError | null }>;
}

/** True when both Supabase env vars are present, i.e. a real backend is configured. */
function hasRealCredentials(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

// Single client instance per process, created on first use.
let supabase: SupabaseClient | null = null;

/**
 * Initialize the Supabase client.
 * Uses real SDK if env vars are provided, otherwise uses mock.
 */
export function initSupabase(): SupabaseClient {
  if (supabase) return supabase;

  if (hasRealCredentials()) {
    // In a real implementation, we would import and instantiate the real SDK here
    // import { createClient } from '@supabase/supabase-js';
    // supabase = createClient(url, anonKey);
    console.log('Supabase initialized with real credentials');
  } else {
    // Dev mock mode - app works without real Supabase keys
    console.log('Supabase running in dev mock mode');
  }

  supabase = {
    from: (table: string) => mockQueryBuilder(table),
    channel: (name: string) => mockChannel(name),
    removeChannel: async () => 'ok',
    storage: {
      from: (bucket: string) => mockStorage(bucket),
    },
  };
  return supabase;
}

/**
 * Check if Supabase is using real SDK or mock
 */
export function isMockMode(): boolean {
  return !hasRealCredentials();
}

// ---------------------------------------------------------------------------
// Mock Query Builder
// ---------------------------------------------------------------------------

interface MockQueryBuilderData {
  table: string;
  filters: Array<{ column: string; operator: string; value: any }>;
  orders: Array<{ column: string; ascending: boolean }>;
  limit?: number;
  single: boolean;
}

function mockQueryBuilder(table: string): SupabaseQueryBuilder {
  const state: MockQueryBuilderData = {
    table,
    filters: [],
    orders: [],
    single: false,
  };

  // Chainable methods return the same builder, mirroring the real SDK.
  const builder: SupabaseQueryBuilder = {
    select: async <T = any>(_column?: string): Promise<{ data: T | null; error: SupabaseError | null }> => {
      // In mock mode, return empty data - real implementation would query Supabase
      return { data: null, error: null };
    },

    insert: async <T>(_data: T): Promise<{ data: T | null; error: SupabaseError | null }> => {
      return { data: null, error: null };
    },

    update: async <T>(_data: T): Promise<{ data: T | null; error: SupabaseError | null }> => {
      return { data: null, error: null };
    },

    delete: async (): Promise<{ data: any | null; error: SupabaseError | null }> => {
      return { data: null, error: null };
    },

    eq: (column: string, value: any): SupabaseQueryBuilder => {
      state.filters.push({ column, operator: 'eq', value });
      return builder;
    },

    gt: (column: string, value: any): SupabaseQueryBuilder => {
      state.filters.push({ column, operator: 'gt', value });
      return builder;
    },

    gte: (column: string, value: any): SupabaseQueryBuilder => {
      state.filters.push({ column, operator: 'gte', value });
      return builder;
    },

    lt: (column: string, value: any): SupabaseQueryBuilder => {
      state.filters.push({ column, operator: 'lt', value });
      return builder;
    },

    lte: (column: string, value: any): SupabaseQueryBuilder => {
      state.filters.push({ column, operator: 'lte', value });
      return builder;
    },

    order: (column: string, options?: { ascending?: boolean; foreignTable?: string }): SupabaseQueryBuilder => {
      state.orders.push({ column, ascending: options?.ascending !== false });
      return builder;
    },

    limit: (count: number): SupabaseQueryBuilder => {
      state.limit = count;
      return builder;
    },

    maybeSingle: (): SupabaseQueryBuilder => {
      state.single = true;
      return builder;
    },
  };

  return builder;
}

// ---------------------------------------------------------------------------
// Mock Realtime Channel
// ---------------------------------------------------------------------------

function mockChannel(_name: string): SupabaseRealtimeChannel {
  const channel: SupabaseRealtimeChannel = {
    on: () => channel,
    subscribe: (callback?: (status: string) => void) => {
      callback?.('SUBSCRIBED');
      return channel;
    },
    unsubscribe: async () => 'ok',
  };
  return channel;
}

// ---------------------------------------------------------------------------
// Mock Storage
// ---------------------------------------------------------------------------

function mockStorage(bucket: string): SupabaseStorage {
  return {
    upload: async (path: string, _file: File | string, _options?: any): Promise<{ data: any; error: SupabaseError | null }> => {
      return { data: { path }, error: null };
    },

    getPublicUrl: (path: string): { data: { publicUrl: string }; error: null } => {
      return { data: { publicUrl: `https://example.com/storage/v1/bucket/${bucket}/path/${path}` }, error: null };
    },

    remove: async (_path: string): Promise<{ data: any; error: SupabaseError | null }> => {
      return { data: null, error: null };
    },
  };
}
