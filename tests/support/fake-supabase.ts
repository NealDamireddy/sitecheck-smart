/**
 * Chainable Supabase client fake for route-level tests.
 *
 * Mirrors the subset of supabase-js the API routes actually use:
 *   from(t).select(...).eq(...).order(...).limit(...)        → thenable
 *   from(t).select(...).eq(...).single() / .maybeSingle()
 *   from(t).insert(...).select().single()
 *   from(t).update(...).eq(...).select().single()
 *   from(t).upsert(...) / .delete().eq(...) / .in(...)
 *
 * Per-table fixtures decide what comes back. `rows` answers list reads,
 * `single` answers `.single()/.maybeSingle()`, and `error` forces a
 * failure. Setting `single: null` models the RLS case that matters most
 * for isolation: another tenant's row is simply not visible.
 *
 * Every operation is recorded in `calls` so a test can assert that a
 * route never attempted a write.
 */

export interface TableFixture {
  /** Rows returned by a list read (await on the builder). */
  rows?: unknown[];
  /** Row returned by .single() / .maybeSingle(). `null` = not found. */
  single?: unknown;
  /** Row(s) returned by .insert()/.update()/.upsert() + .select(). */
  written?: unknown;
  /** Forces an error result on every terminal for this table. */
  error?: { code?: string; message: string };
}

export interface RecordedCall {
  table: string;
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  payload?: unknown;
  filters: Array<[string, unknown]>;
}

const PGRST_NO_ROWS = { code: 'PGRST116', message: 'No rows found' };

class QueryBuilder implements PromiseLike<{ data: unknown; error: unknown }> {
  private op: RecordedCall['op'] = 'select';
  private payload: unknown;
  private filters: Array<[string, unknown]> = [];

  constructor(
    private table: string,
    private fixture: TableFixture,
    private calls: RecordedCall[]
  ) {}

  private record() {
    this.calls.push({
      table: this.table,
      op: this.op,
      payload: this.payload,
      filters: [...this.filters],
    });
  }

  select(): this {
    return this;
  }
  insert(payload: unknown): this {
    this.op = 'insert';
    this.payload = payload;
    this.record();
    return this;
  }
  update(payload: unknown): this {
    this.op = 'update';
    this.payload = payload;
    this.record();
    return this;
  }
  upsert(payload: unknown): this {
    this.op = 'upsert';
    this.payload = payload;
    this.record();
    return this;
  }
  delete(): this {
    this.op = 'delete';
    this.record();
    return this;
  }
  eq(column: string, value: unknown): this {
    this.filters.push([column, value]);
    return this;
  }
  in(column: string, values: unknown): this {
    this.filters.push([column, values]);
    return this;
  }
  order(): this {
    return this;
  }
  limit(): this {
    return this;
  }
  range(): this {
    return this;
  }

  private terminalRow(allowNotFoundError: boolean) {
    if (this.fixture.error) return { data: null, error: this.fixture.error };
    const written = this.op !== 'select' ? this.fixture.written : undefined;
    const row = written ?? this.fixture.single ?? null;
    if (row === null && allowNotFoundError) {
      return { data: null, error: PGRST_NO_ROWS };
    }
    return { data: row, error: null };
  }

  async single() {
    if (this.op === 'select') this.record();
    return this.terminalRow(true);
  }

  async maybeSingle() {
    if (this.op === 'select') this.record();
    return this.terminalRow(false);
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    if (this.op === 'select') this.record();
    const result = this.fixture.error
      ? { data: null, error: this.fixture.error }
      : this.op === 'select'
        ? { data: this.fixture.rows ?? [], error: null }
        : { data: this.fixture.written ?? null, error: null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

export interface FakeSupabase {
  client: unknown;
  calls: RecordedCall[];
  /** Writes attempted (insert/update/upsert/delete) — for "never wrote" assertions. */
  writes(): RecordedCall[];
}

export function makeFakeSupabase(
  fixtures: Record<string, TableFixture> = {}
): FakeSupabase {
  const calls: RecordedCall[] = [];
  const client = {
    from(table: string) {
      return new QueryBuilder(table, fixtures[table] ?? {}, calls);
    },
    storage: {
      from() {
        return {
          upload: async () => ({ error: null }),
          getPublicUrl: () => ({ data: { publicUrl: 'https://example/x.jpg' } }),
          createSignedUrl: async () => ({
            data: { signedUrl: 'https://example/signed.jpg' },
            error: null,
          }),
          remove: async () => ({ error: null }),
        };
      },
    },
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-a' } }, error: null }),
    },
  };
  return {
    client,
    calls,
    writes: () => calls.filter((c) => c.op !== 'select'),
  };
}
