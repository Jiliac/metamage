-- Least-privilege roles for the tournament Postgres (Neon).
--
-- Two roles back the two-engine split the code already encodes:
--   * metamage_ro  — SELECT-only. Used by the MCP server (get_engine) and the
--                    R visualization layer. This is the PRIMARY read-only guard
--                    (the MCP default_transaction_read_only listener is only
--                    defense-in-depth).
--   * metamage_rw  — read/write. Used by the ingest and the archetype-alias
--                    write path (get_alias_write_engine), and to run Alembic.
--
-- Run against the tournament database after the schema exists (create_all +
-- `alembic stamp head`). Supply passwords and the db name as psql variables:
--
--   psql "$ADMIN_URL" \
--     -v ro_password="'...'" -v rw_password="'...'" -v dbname=tournament \
--     -f scripts/setup_pg_roles.sql
--
-- The connection strings then map to env vars:
--   TOURNAMENT_DATABASE_URL       -> metamage_ro   (MCP + R read path)
--   TOURNAMENT_DATABASE_WRITE_URL -> metamage_rw   (ingest + alias writes)

-- Roles are created idempotently. psql interpolates :'var' in a SELECT (but not
-- inside a dollar-quoted DO body), and \gexec runs the generated CREATE ROLE.
SELECT 'CREATE ROLE metamage_ro LOGIN PASSWORD ' || quote_literal(:'ro_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'metamage_ro')
\gexec

SELECT 'CREATE ROLE metamage_rw LOGIN PASSWORD ' || quote_literal(:'rw_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'metamage_rw')
\gexec

GRANT CONNECT ON DATABASE :dbname TO metamage_ro, metamage_rw;

-- Read-only role: usage + SELECT on current and future tables.
GRANT USAGE ON SCHEMA public TO metamage_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO metamage_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO metamage_ro;

-- Read/write role: DML on all tables, plus CREATE for Alembic DDL.
GRANT USAGE, CREATE ON SCHEMA public TO metamage_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO metamage_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO metamage_rw;
-- Sequences are unused today (UUID string PKs) but grant for safety/future use.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO metamage_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO metamage_rw;
