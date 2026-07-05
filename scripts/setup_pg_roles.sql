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
-- Run this BEFORE the backfill. The roles must exist for the backfill to
-- connect as metamage_rw, and the FOR ROLE metamage_rw default privileges below
-- must be in place before the backfill creates tables so metamage_ro
-- automatically gains SELECT on them. (Running it after the schema exists also
-- works — the explicit GRANT ... ON ALL TABLES covers already-created tables —
-- but "before" is the recommended, order-independent path.)
--
-- Supply passwords and the db name as psql variables (run as a Neon admin/owner
-- role that can create roles):
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

-- The backfill creates the tables while connected as metamage_rw, so the
-- read-only grants must cover tables OWNED BY metamage_rw. Default privileges
-- only auto-apply to objects created by the role named in FOR ROLE, so we set
-- them FOR ROLE metamage_rw. This makes ordering safe: run this script BEFORE
-- the backfill and metamage_ro automatically gains SELECT on every table the
-- backfill creates. Managing another role's default privileges requires
-- membership in it (superusers are exempt).
GRANT metamage_rw TO CURRENT_USER;

-- Defense-in-depth: strip the default CREATE/USAGE that PUBLIC holds on schema
-- public (present on PG < 15) so only the roles explicitly granted below can use
-- it; metamage_ro must stay SELECT-only and gains USAGE via the grant on line 52.
REVOKE CREATE, USAGE ON SCHEMA public FROM PUBLIC;

-- Read-only role: usage + SELECT on tables that already exist AND future ones
-- created by metamage_rw (the backfill) or by the current admin.
GRANT USAGE ON SCHEMA public TO metamage_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO metamage_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO metamage_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE metamage_rw IN SCHEMA public
  GRANT SELECT ON TABLES TO metamage_ro;

-- Read/write role: DML + CREATE for DDL. Tables it creates it owns outright;
-- these grants cover any tables created by the admin instead.
GRANT USAGE, CREATE ON SCHEMA public TO metamage_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO metamage_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO metamage_rw;
-- Sequences are unused today (UUID string PKs) but grant for safety/future use.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO metamage_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO metamage_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE metamage_rw IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO metamage_rw;
