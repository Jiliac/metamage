-- Least-privilege read-only grants for the Ops database (Neon `neondb`) —
-- the sibling of scripts/setup_pg_roles.sql (tournament DB).
--
-- The Ops DB stores chat/social telemetry written by the agents
-- (POSTGRES_URL in the root .env) and read by the ui/ Next.js app
-- (DATABASE_URL) to browse sessions and tool results. Tables are created by
-- src/socialbot/server.py::ensure_tables (Base.metadata.create_all) while
-- connected as the owner, so this script only needs to grant READ.
--
-- Run once as the owner role:
--   psql "$POSTGRES_URL" -f scripts/setup_ops_pg_roles.sql
--
-- The ui then connects with:
--   DATABASE_URL = postgresql://metamage_ro:<password>@<host>/neondb?sslmode=require
-- (same host as the tournament DB; different database name.)

-- The schema was created by neondb_owner; PUBLIC may already hold USAGE on
-- PG < 15, but grant explicitly so the ro role works on any provisioner.
GRANT USAGE ON SCHEMA public TO metamage_ro;

-- Read on every existing table.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO metamage_ro;

-- Future tables created by the owner (ensure_tables) are readable too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO metamage_ro;

-- Verify (expect: counts, not permission errors):
--   psql "$RO_URL" -tAc "select count(*) from chat_sessions"
--   psql "$RO_URL" -c "insert into chat_sessions (id, provider) values (gen_random_uuid()::text, 'test')"  -- must fail
