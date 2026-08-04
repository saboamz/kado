-- 0001_schema.test.sql
--
-- pgTAP tests for the P4 security baseline.
--
-- Run with:  supabase test db
-- or:        pg_prove --ext .sql supabase/tests/
--
-- These are not "does the schema exist" smoke tests. Each one pins an invariant
-- that, if it silently broke, would either leak reservation state or corrupt the
-- catalogue. Read the comment above a failing test before "fixing" it — several
-- of them are load-bearing in ways that are not obvious from the assertion.

begin;

create extension if not exists pgtap with schema extensions;

-- pgTAP lives in `extensions` (Supabase convention: extensions stay out of
-- `public` so PostgREST does not expose them as RPC). Its functions are called
-- unqualified throughout this file, so put that schema on the path for the
-- duration of the test transaction.
set local search_path = public, extensions;

-- 75 = 2 aggregate RLS checks + 10 per-table RLS + 10 per-table policy-exists
--      + 8 schema-isolation + 4 anti-leak + 9 normalize_url + 10 parse_price_fr
--      + 15 price_band + 6 is_friend/volatility + 1 search_path.
-- The per-table blocks are generated with unnest(), so this number moves when a
-- table is added to those arrays — update it deliberately rather than switching
-- to no_plan(). A fixed plan is what catches a test that silently stopped
-- running; no_plan() would report success for a file that executed nothing.
select plan(75);

-- ===========================================================================
-- 1. RLS is enabled AND FORCED on every table in `public`
-- ===========================================================================
-- Both halves matter and they are different things:
--
--   rowsecurity  = policies exist and apply to ordinary roles.
--   forcerowsecurity = policies also apply to the TABLE OWNER.
--
-- Migrations run as the owner, and so do SECURITY DEFINER functions owned by
-- postgres. Without FORCE, every one of those bypasses RLS silently — the
-- policies look correct in the catalogue and simply do not run. That is the
-- worst failure mode available: a security control that is present, reviewed,
-- and inert.
--
-- Written as a dynamic check over pg_tables rather than a list of table names
-- so that a table added in a LATER migration without RLS fails this test. A
-- hardcoded list would pass forever while new tables shipped unprotected.

select is(
  (select count(*)::int
     from pg_tables
    where schemaname = 'public'
      and not rowsecurity),
  0,
  'every public table has row level security ENABLED'
);

select is(
  (select count(*)::int
     from pg_tables t
     join pg_class c on c.relname = t.tablename
     join pg_namespace n on n.oid = c.relnamespace and n.nspname = t.schemaname
    where t.schemaname = 'public'
      and not c.relforcerowsecurity),
  0,
  'every public table has row level security FORCED (owner does not bypass)'
);

-- Name the tables individually too, so a failure says WHICH table.
select ok(
  (select relrowsecurity and relforcerowsecurity
     from pg_class where oid = ('public.' || tbl)::regclass),
  format('%s: RLS enabled and forced', tbl)
)
from unnest(array[
  'profiles','follows','wishlists','wish_items',
  'merchants','categories','tags','products','product_tags','notifications'
]) as tbl;

-- Every table must also actually HAVE at least one policy. RLS enabled with no
-- policy denies everything, which is safe but means the feature is broken; RLS
-- enabled with policies is the intended state.
select ok(
  (select count(*) from pg_policies where schemaname='public' and tablename = tbl) > 0,
  format('%s: has at least one policy', tbl)
)
from unnest(array[
  'profiles','follows','wishlists','wish_items',
  'merchants','categories','tags','products','product_tags','notifications'
]) as tbl;

-- ===========================================================================
-- 2. The secret schemas exist and are unreachable by the API roles
-- ===========================================================================
-- P4 creates these empty. They must already be locked down BEFORE P5 puts
-- reservations in them — if the grants were added at the same time as the
-- tables, there would be a window (and a migration ordering dependency) in
-- which the tables existed and were reachable.

select has_schema('private', 'private schema exists');
select has_schema('reco',    'reco schema exists');

-- USAGE on the schema is the gate. Without it, no grant on any table inside
-- can be exercised, which is why this is the assertion that matters most.
select ok(
  not has_schema_privilege('anon', 'private', 'USAGE'),
  'anon has NO USAGE on private'
);
select ok(
  not has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated has NO USAGE on private'
);
select ok(
  not has_schema_privilege('anon', 'reco', 'USAGE'),
  'anon has NO USAGE on reco'
);
select ok(
  not has_schema_privilege('authenticated', 'reco', 'USAGE'),
  'authenticated has NO USAGE on reco'
);
select ok(
  not has_schema_privilege('anon', 'private', 'CREATE'),
  'anon cannot CREATE in private'
);
select ok(
  not has_schema_privilege('authenticated', 'private', 'CREATE'),
  'authenticated cannot CREATE in private'
);

-- NOTE: this file cannot test the thing that matters most — whether `private`
-- and `reco` are listed in PostgREST's exposed-schema setting. That lives in
-- the Supabase project configuration, outside the database and outside version
-- control. Only an HTTP-level test against the deployed API can observe it, and
-- that is what P5 adds. Do not mistake these passing tests for proof that the
-- secret tables are unreachable over REST.

-- ===========================================================================
-- 3. THE ANTI-LEAK ASSERTION
-- ===========================================================================
-- wish_items must never gain a column that records reservation state.
--
-- Why this is a test rather than a comment: the comment in 0006 explains the
-- reasoning, but a comment cannot fail CI. A future engineer adding
-- `reserved_count` to make the friend-facing list view cheaper will not
-- necessarily read that comment — they will read the column list. This test is
-- what stops the merge.
--
-- The pattern is deliberately broad (substring match, not an exact list)
-- because the leak does not depend on the name. `taken`, `claimed_by`,
-- `is_reserved`, `purchase_count` are all the same mistake wearing different
-- labels. If you are adding a legitimate column that trips this test, the
-- right move is almost certainly to put it in `private` keyed by wish_item_id
-- — not to loosen the pattern.
select is(
  (select count(*)::int
     from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'wish_items'
      and (
           column_name ilike '%reserv%'
        or column_name ilike '%taken%'
        or column_name ilike '%claim%'
        or column_name ilike '%purchas%'
        or column_name ilike '%bought%'
        or column_name ilike '%contribut%'
        or column_name ilike '%funded%'
        or column_name ilike '%pledge%'
      )),
  0,
  'wish_items has NO reservation-ish column (a write here is a Realtime timing oracle regardless of RLS)'
);

-- Same rule for wishlists: an aggregate counter on the parent list leaks just
-- as loudly as a per-item flag, and is an easier mistake to rationalise
-- ("it's only a total").
select is(
  (select count(*)::int
     from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'wishlists'
      and (column_name ilike '%reserv%' or column_name ilike '%funded%'
        or column_name ilike '%claim%'  or column_name ilike '%purchas%')),
  0,
  'wishlists has NO reservation-ish column either'
);

-- notifications must have no free-text body: the enum+payload design in 0007 is
-- only a control while it is impossible to store a sentence.
select is(
  (select count(*)::int
     from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'notifications'
      and column_name in ('message','body','text','content','title','subtitle','description')),
  0,
  'notifications has NO free-text message column (prose is the leak vector)'
);

-- And the enum must not have grown an owner-facing reservation kind.
select is(
  (select count(*)::int
     from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'notif_kind'
      and (e.enumlabel ilike '%reserv%' or e.enumlabel ilike '%purchas%'
        or e.enumlabel ilike '%bought%')),
  0,
  'notif_kind has no reservation/purchase notification kind'
);

-- ===========================================================================
-- 4. normalize_url
-- ===========================================================================
select is(public.normalize_url('https://www.apple.com/fr/airpods-pro'),
          'apple.com/fr/airpods-pro',
          'normalize_url strips scheme and www');

select is(public.normalize_url('http://apple.com/fr/airpods-pro/'),
          'apple.com/fr/airpods-pro',
          'normalize_url strips trailing slash and treats http/https alike');

select is(public.normalize_url('https://APPLE.com/fr/AirPods-Pro#tech-specs'),
          'apple.com/fr/airpods-pro',
          'normalize_url lowercases and strips the fragment');

select is(public.normalize_url('https://apple.com/fr/airpods-pro?utm_source=news&utm_campaign=x&gclid=1&fbclid=2'),
          'apple.com/fr/airpods-pro',
          'normalize_url strips every tracking param, leaving no dangling ?');

select is(public.normalize_url('https://decathlon.fr/mh500?ref=a&referrer=b&source=c&igshid=d&srsltid=e&th=1&psc=1&mc_cid=x&_branch_match_id=y'),
          'decathlon.fr/mh500',
          'normalize_url strips the full tracking-param family');

-- Param ORDER must not affect identity. Without the sort in normalize_url,
-- these two produce different hashes and the same product forks into two
-- catalogue rows — which is the entire failure mode dedup exists to prevent.
select is(public.normalize_url('https://sessun.com/vase?color=sable&size=m'),
          public.normalize_url('https://sessun.com/vase?size=m&color=sable'),
          'normalize_url sorts surviving params so order does not fork identity');

-- Regression guard: the tracking filter must not be a bare `^ref` prefix.
-- `refresh`, `reference` and `refurbished` are real merchant params, and
-- eating them would silently merge genuinely different product URLs.
select is(public.normalize_url('https://x.fr/p?refresh=true'),
          'x.fr/p?refresh=true',
          'normalize_url keeps `refresh` (prefix-matching `ref` would eat real params)');

select is(public.normalize_url('https://x.fr/p?reference=ab12'),
          'x.fr/p?reference=ab12',
          'normalize_url keeps `reference`');

select is(public.normalize_url(null), null, 'normalize_url(null) is null');

-- ===========================================================================
-- 5. parse_price_fr  — the three-space trap
-- ===========================================================================
-- French typography uses three visually identical space characters as the
-- thousands separator. Intl.NumberFormat('fr-FR') — which our own frontend
-- uses — emits U+202F. A regexp handling only U+0020 parses '1 599 €' as 1.
select is(public.parse_price_fr('279 €'), 27900,
          'parse_price_fr: simple price to cents');

select is(public.parse_price_fr('1 599 €'), 159900,
          'parse_price_fr: U+0020 regular space thousands separator');

select is(public.parse_price_fr('1' || U&'\00A0' || '599 €'), 159900,
          'parse_price_fr: U+00A0 NBSP thousands separator');

select is(public.parse_price_fr('1' || U&'\202F' || '599 €'), 159900,
          'parse_price_fr: U+202F NARROW NBSP (what Intl.NumberFormat fr-FR emits)');

-- All three spellings must agree with each other, not merely each be non-null.
select is(
  public.parse_price_fr('1 599 €'),
  public.parse_price_fr('1' || U&'\202F' || '599 €'),
  'parse_price_fr: regular space and narrow NBSP agree'
);

select is(public.parse_price_fr('1 240,50 €'), 124050,
          'parse_price_fr: comma is the decimal separator');

select is(public.parse_price_fr('12,5 €'), 1250,
          'parse_price_fr: single decimal digit pads to 50 cents, not 5');

select is(public.parse_price_fr('1.599 €'), 159900,
          'parse_price_fr: dot as a French thousands separator');

select is(public.parse_price_fr('aucun lien'), null,
          'parse_price_fr: non-numeric text is null, not 0 (unknown <> free)');

select is(public.parse_price_fr(null), null, 'parse_price_fr(null) is null');

-- ===========================================================================
-- 6. price_band boundaries
-- ===========================================================================
-- Boundaries are half-open: band N covers up to but NOT including its ceiling.
-- Off-by-one here silently mis-buckets every product at a round price point,
-- which is exactly where real prices cluster (20.00, 50.00, 100.00 EUR).
select is(public.price_band(null), 0::smallint, 'price_band: null price is band 0 (unknown, not cheap)');
select is(public.price_band(0),    1::smallint, 'price_band: 0 cents is band 1');
select is(public.price_band(1999), 1::smallint, 'price_band: 19,99 EUR is band 1');
select is(public.price_band(2000), 2::smallint, 'price_band: 20,00 EUR crosses into band 2');
select is(public.price_band(4999), 2::smallint, 'price_band: 49,99 EUR is band 2');
select is(public.price_band(5000), 3::smallint, 'price_band: 50,00 EUR crosses into band 3');
select is(public.price_band(9999), 3::smallint, 'price_band: 99,99 EUR is band 3');
select is(public.price_band(10000),4::smallint, 'price_band: 100 EUR crosses into band 4');
select is(public.price_band(19999),4::smallint, 'price_band: 199,99 EUR is band 4');
select is(public.price_band(20000),5::smallint, 'price_band: 200 EUR crosses into band 5');
select is(public.price_band(49999),5::smallint, 'price_band: 499,99 EUR is band 5');
select is(public.price_band(50000),6::smallint, 'price_band: 500 EUR crosses into band 6');
select is(public.price_band(99999),6::smallint, 'price_band: 999,99 EUR is band 6');
select is(public.price_band(100000),7::smallint,'price_band: 1000 EUR crosses into band 7');
select is(public.price_band(159900),7::smallint,'price_band: the 1 599 EUR MacBook is band 7');

-- ===========================================================================
-- 7. is_friend is symmetric
-- ===========================================================================
-- Friendship is mutual-accepted, so the function must not care about argument
-- order. An asymmetric implementation would make a friends-only list readable
-- in one direction and not the other — a bug that presents as "sometimes the
-- list is empty" and is miserable to diagnose.
--
-- Self-contained fixtures with local ids so this test does not depend on
-- seed.sql having been run.
create temporary table _t_ids (label text, id uuid) on commit drop;
insert into _t_ids values
  ('a','dddddddd-0000-4000-8000-00000000000a'),
  ('b','dddddddd-0000-4000-8000-00000000000b'),
  ('c','dddddddd-0000-4000-8000-00000000000c');

insert into auth.users (id, email) values
  ('dddddddd-0000-4000-8000-00000000000a','tap_a@kado.test'),
  ('dddddddd-0000-4000-8000-00000000000b','tap_b@kado.test'),
  ('dddddddd-0000-4000-8000-00000000000c','tap_c@kado.test');

-- a <-> b mutual accepted = friends.
insert into public.follows (follower_id, followee_id, state) values
  ('dddddddd-0000-4000-8000-00000000000a','dddddddd-0000-4000-8000-00000000000b','accepted'),
  ('dddddddd-0000-4000-8000-00000000000b','dddddddd-0000-4000-8000-00000000000a','accepted'),
  -- a -> c one-directional only: NOT friends.
  ('dddddddd-0000-4000-8000-00000000000a','dddddddd-0000-4000-8000-00000000000c','accepted');

select ok(
  public.is_friend('dddddddd-0000-4000-8000-00000000000a','dddddddd-0000-4000-8000-00000000000b'),
  'is_friend: mutual accepted follow is a friendship'
);

select is(
  public.is_friend('dddddddd-0000-4000-8000-00000000000a','dddddddd-0000-4000-8000-00000000000b'),
  public.is_friend('dddddddd-0000-4000-8000-00000000000b','dddddddd-0000-4000-8000-00000000000a'),
  'is_friend is symmetric in its arguments'
);

select ok(
  not public.is_friend('dddddddd-0000-4000-8000-00000000000a','dddddddd-0000-4000-8000-00000000000c'),
  'is_friend: a one-directional follow is NOT a friendship'
);

select ok(
  not public.is_friend('dddddddd-0000-4000-8000-00000000000c','dddddddd-0000-4000-8000-00000000000a'),
  'is_friend: one-directional follow is not a friendship in the reverse direction either'
);

-- STABLE, not VOLATILE. A VOLATILE function in an RLS predicate is re-evaluated
-- per candidate row, turning every friend's-list read quadratic. provolatile:
-- 'i' immutable, 's' stable, 'v' volatile.
select is(
  (select provolatile::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='is_friend'),
  's',
  'is_friend is STABLE (VOLATILE in an RLS predicate re-runs per row)'
);

select is(
  (select provolatile::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='can_view_wishlist'),
  's',
  'can_view_wishlist is STABLE for the same reason'
);

-- ===========================================================================
-- 8. SECURITY DEFINER functions must pin search_path
-- ===========================================================================
-- A SECURITY DEFINER function with a mutable search_path is a privilege
-- escalation primitive: the caller chooses which schema an unqualified name
-- resolves to and can substitute their own function for one the definer meant
-- to call. Every DEFINER function in `public` must carry `set search_path`.
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and (p.proconfig is null
           or not exists (
             select 1 from unnest(p.proconfig) cfg
             where cfg like 'search_path=%'))),
  0,
  'every SECURITY DEFINER function in public pins its search_path'
);

select * from finish();

rollback;
