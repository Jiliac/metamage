import postgres, { type Sql } from 'postgres'

// ---------------------------------------------------------------------------
// The one process-wide postgres.js client, created LAZILY on first use.
//
// `@/datasource` statically imports the Postgres backend so the DATA_SOURCE
// switch can pick it; ES imports evaluate unconditionally, so nothing in this
// module may read env or open a pool at load time — otherwise fixtures mode
// (the default, and every machine without the secret) would crash on import.
// `PostgresDataSource`'s constructor calls `db()` so `DATA_SOURCE=postgres`
// still fails loudly at `getDataSource()` time when the URL is missing.
//
// Env: TOURNAMENT_DATABASE_URL must point at the SELECT-only `metamage_ro`
// role (blueprint KTD-4/U3 — the web is a read-only consumer). A missing URL
// is a hard configuration error, NOT a silent fixture fallback: serving
// fixture data under DATA_SOURCE=postgres would be a data-integrity failure.
// ---------------------------------------------------------------------------

let _sql: Sql | null = null

/** Normalize the `postgres://` scheme Neon sometimes exports; the driver
 *  accepts both but the error surfaces stay consistent this way. */
function normalizeUrl(url: string): string {
  return url.startsWith('postgres://')
    ? `postgresql://${url.slice('postgres://'.length)}`
    : url
}

function readUrl(): string {
  const url = process.env.TOURNAMENT_DATABASE_URL
  if (!url) {
    throw new Error(
      '[datasource/postgres] TOURNAMENT_DATABASE_URL is not set — the Postgres ' +
        'data source cannot serve live data. Set it to the metamage_ro ' +
        'connection string, or unset DATA_SOURCE to use fixtures.'
    )
  }
  return normalizeUrl(url)
}

/**
 * The shared client. postgres.js pools internally; Next.js reuses the module
 * singleton across requests/render. `prepare: false` keeps statements
 * unnamed — transient/serverless runtimes behind poolers can otherwise
 * collide on prepared-statement names.
 */
export function db(): Sql {
  if (_sql === null) {
    _sql = postgres(readUrl(), {
      prepare: false,
      max: 10,
      idle_timeout: 20,
    })
  }
  return _sql
}
