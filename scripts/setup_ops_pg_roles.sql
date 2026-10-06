-- Least-privilege read-only role for the Ops database (Neon `neondb`) —
-- the sibling of scripts/setup_pg_roles.sql (tournament DB).
--
-- The Ops DB stores chat/social telemetry written by the agents
-- (POSTGRES_URL in the root .env, role neondb_owner) and read by the ui/
-- Next.js app (DATABASE_URL) to browse sessions and tool results. Tables are
-- created by src/socialbot/server.py::ensure_tables (Base.metadata.create_all)
-- while connected as the owner, so this script only needs to grant READ.
--
-- The ui gets its own role, metamage_ops_ro, instead of reusing the tournament
-- DB's metamage_ro: Postgres roles are cluster-wide on Neon, so sharing one
-- role would let the public web app's credential (TOURNAMENT_DATABASE_URL)
-- read chat telemetry too. This script also strips any Ops-DB access
-- metamage_ro was given by an earlier version of this file.
--
-- Run once as the owner role (pass the bare password; :'ro_password' below
-- does the SQL quoting, so extra quotes would become part of the password):
--   psql "$POSTGRES_URL" -v ro_password="$OPS_RO_PASSWORD" -f scripts/setup_ops_pg_roles.sql
--
-- The ui then connects with:
--   DATABASE_URL = postgresql://metamage_ops_ro:<password>@<host>/neondb?sslmode=require
-- (same host as the tournament DB; different database name.)

-- Created idempotently; psql interpolates :'var' in a SELECT and \gexec runs it.
SELECT 'CREATE ROLE metamage_ops_ro LOGIN PASSWORD ' || quote_literal(:'ro_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'metamage_ops_ro')
\gexec

-- Only the owner and the ui role may connect. PUBLIC holds CONNECT by default,
-- which is what let metamage_ro in.
REVOKE CONNECT ON DATABASE neondb FROM PUBLIC;
GRANT CONNECT ON DATABASE neondb TO metamage_ops_ro;

-- The schema was created by neondb_owner; PUBLIC may already hold USAGE on
-- PG < 15, but grant explicitly so the ro role works on any provisioner.
GRANT USAGE ON SCHEMA public TO metamage_ops_ro;

-- Read on every existing table, and on future tables the owner creates
-- (ensure_tables).
GRANT SELECT ON ALL TABLES IN SCHEMA public TO metamage_ops_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO metamage_ops_ro;

-- Undo the grants the previous version of this script gave metamage_ro.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE SELECT ON TABLES FROM metamage_ro;
REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM metamage_ro;
REVOKE USAGE ON SCHEMA public FROM metamage_ro;
REVOKE CONNECT ON DATABASE neondb FROM metamage_ro;

-- Verify (expect: counts, not permission errors):
--   psql "$OPS_RO_URL" -tAc "select count(*) from chat_sessions"
--   psql "$OPS_RO_URL" -c "insert into chat_sessions (id, provider) values (gen_random_uuid()::text, 'test')"  -- must fail
--   psql "<metamage_ro URL with /neondb>" -c "select 1"                                                      -- must fail to connect
