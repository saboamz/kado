-- 0001_extensions_and_schemas.sql
--
-- Extensions and the three-schema split that the whole secrecy model rests on.
--
-- Kado's product rule is absolute: the owner of a wishlist must never be able to
-- learn that one of their wishes has been reserved. Everything in this file
-- exists to make that rule enforceable by the database rather than by the
-- discipline of whoever writes the next feature.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
-- Supabase convention is to keep extensions out of `public` so that PostgREST
-- does not expose their helper functions as RPC endpoints. `extensions` already
-- exists on a stock Supabase project; we create it defensively so the migration
-- also applies to a bare Postgres used in CI.
create schema if not exists extensions;

create extension if not exists pgcrypto  with schema extensions; -- gen_random_uuid(), digest() for url_hash
create extension if not exists citext    with schema extensions; -- case-insensitive handles, slugs, domains
create extension if not exists pg_trgm   with schema extensions; -- fuzzy search on handles and product titles
create extension if not exists unaccent  with schema extensions; -- "Cafetière" and "Cafetiere" must collide
create extension if not exists vector    with schema extensions; -- product embeddings for the reco engine (P6)
create extension if not exists pg_cron   with schema extensions; -- price refresh + birthday digest jobs

-- Generated columns must call functions that are resolvable at DDL time and at
-- every future write, and generated-column expressions cannot depend on a
-- runtime search_path. Our helper functions in 0003 therefore call
-- extensions.unaccent(...) and extensions.digest(...) fully qualified. Keeping
-- extensions in their own schema is what makes those names stable.

-- ---------------------------------------------------------------------------
-- Schemas
-- ---------------------------------------------------------------------------

-- `private` holds the secret side of the app: reservations, pots and
-- contributions (created in P4's successor, P5). Nothing in here is ever
-- readable by a wishlist owner, and nothing in here is reachable over the REST
-- or Realtime APIs at all.
create schema if not exists private;

-- `reco` holds derived recommendation state: interaction events, co-occurrence
-- matrices, candidate sets. It is separate from `private` because it has a
-- different lifecycle (rebuildable from scratch, high write volume, dropped and
-- recomputed by cron) but it shares the same exposure rule: interaction events
-- include `reserve` and `purchase`, so a leaked reco table is a leaked
-- reservation table.
create schema if not exists reco;

-- Belt: no API role may touch either schema, even if a future migration
-- accidentally grants table-level rights. Without USAGE on the schema, a grant
-- on a table inside it is inert.
revoke all on schema private, reco from anon, authenticated;

-- Braces: revoke the default-privilege pipeline too. `alter default privileges`
-- from a previous migration or from the Supabase bootstrap could otherwise hand
-- SELECT to `authenticated` on every table created later in these schemas.
alter default privileges in schema private revoke all on tables    from anon, authenticated;
alter default privileges in schema private revoke all on sequences from anon, authenticated;
alter default privileges in schema private revoke all on functions from anon, authenticated;
alter default privileges in schema reco    revoke all on tables    from anon, authenticated;
alter default privileges in schema reco    revoke all on sequences from anon, authenticated;
alter default privileges in schema reco    revoke all on functions from anon, authenticated;

-- The service_role key bypasses RLS and is used by Edge Functions and cron, so
-- it keeps full access. It must never be shipped to a browser.
grant usage on schema private, reco to service_role;

comment on schema private is
  'Secret side of Kado: reservations, pots, contributions (P5). Never exposed to PostgREST.';
comment on schema reco is
  'Derived recommendation state (P6). Rebuildable, but contains reserve/purchase events, so it is as sensitive as `private`.';

-- ===========================================================================
--  READ THIS BEFORE TOUCHING THE SUPABASE DASHBOARD
-- ===========================================================================
--
--  `private` and `reco` must NEVER be added to the project's list of exposed
--  schemas (Dashboard -> Project Settings -> API -> "Exposed schemas", which
--  writes PostgREST's `db-schemas` / `pgrst.db_schemas` setting).
--
--  Why this matters more than any policy in this repo:
--
--    * RLS on `private.reservations` is defence in depth. The PRIMARY control
--      is that PostgREST does not know the schema exists, so there is no URL
--      that reaches it, so there is no query to filter, so there is no timing
--      difference, error code, or row-count side channel for an owner to
--      measure. A 404 from an unrouted schema leaks strictly less than a
--      correctly-filtered empty 200 from a routed one.
--    * The same setting governs Realtime. A wishlist owner subscribed to their
--      own list must not receive so much as an empty change notification when a
--      friend reserves an item; the moment `private` is exposed, the WAL
--      broadcast becomes a timing oracle even if every row is filtered out.
--
--  And here is the trap: that setting lives in the Supabase project
--  configuration, NOT in this repository. No migration in `supabase/migrations`
--  can assert it, no code review can catch a regression in it, and a single
--  click by a future maintainer who is "just trying to query the pot table from
--  the dashboard" silently undoes the entire secrecy model with no diff.
--
--  That is precisely why P5 ships an HTTP-level test that talks to the deployed
--  REST endpoint with an `anon` key and an `authenticated` key and asserts that
--  `/rest/v1/reservations` (and the pot and contribution tables) return
--  "schema must be one of the following" / 404 rather than 200-with-zero-rows.
--  Only an out-of-database test can observe an out-of-database setting. If that
--  test ever starts failing, treat it as a production incident, not a flake:
--  the schema has been exposed and reservation state may already be readable.
-- ===========================================================================
