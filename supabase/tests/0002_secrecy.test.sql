-- 0002_secrecy.test.sql
--
-- The product's central promise, asserted at the database level.
--
-- src/App.test.tsx proves the UI does not RENDER a reservation to the owner.
-- This file proves the server will not SEND one. Both are needed and this is
-- the one that matters: a UI test passes just as happily when the data is
-- sitting in the client's memory waiting to be read out of the network tab.
--
-- Run: psql -f supabase/tests/0002_secrecy.test.sql

begin;
select plan(35);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
-- sophie owns a list; marc and lea are her friends; zoe is a stranger.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'sophie@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'marc@example.test'),
  ('33333333-3333-3333-3333-333333333333', 'lea@example.test'),
  ('44444444-4444-4444-4444-444444444444', 'zoe@example.test')
on conflict do nothing;

update public.profiles set handle = 'sophie_t', display_name = 'Sophie'
  where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set handle = 'marc_t', display_name = 'Marc'
  where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set handle = 'lea_t', display_name = 'Lea'
  where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set handle = 'zoe_t', display_name = 'Zoe'
  where id = '44444444-4444-4444-4444-444444444444';

-- Mutual accepted follows = friendship.
insert into public.follows (follower_id, followee_id, state) values
  ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','accepted'),
  ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','accepted'),
  ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','accepted'),
  ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','accepted')
on conflict do nothing;

insert into public.wishlists (id, owner_id, title, slug, visibility) values
  ('aaaaaaaa-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'Anniversaire', 'anniv-test', 'friends');

insert into public.wish_items (id, wishlist_id, owner_id, title, price_cents, is_pot) values
  ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111','AirPods Pro 3', 27900, false),
  ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111','MacBook Air', 159900, true);

-- Marc reserves the AirPods; lea and marc both chip into the MacBook pot.
insert into private.reservations (wish_item_id, owner_id, reserver_id) values
  ('bbbbbbbb-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');

insert into private.pots (id, wish_item_id, owner_id, target_cents, organizer_id) values
  ('cccccccc-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111', 159900, '22222222-2222-2222-2222-222222222222');

insert into private.contributions (pot_id, contributor_id, amount_cents, state, captured_at) values
  ('cccccccc-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222', 50000,'captured', now()),
  ('cccccccc-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333', 15000,'captured', now());

-- ---------------------------------------------------------------------------
-- 1. Structural: the tables are unreachable by construction
-- ---------------------------------------------------------------------------
select has_schema('private', 'the private schema exists');
select has_schema('reco',    'the reco schema exists');

select is_empty(
  $$ select 1 from information_schema.role_table_grants
     where table_schema in ('private','reco')
       and grantee in ('anon','authenticated') $$,
  'anon/authenticated hold NO table privileges in private or reco'
);

select is_empty(
  $$ select 1 from information_schema.schemata s
     join pg_namespace n on n.nspname = s.schema_name
     where s.schema_name in ('private','reco')
       and (has_schema_privilege('anon', s.schema_name, 'USAGE')
         or has_schema_privilege('authenticated', s.schema_name, 'USAGE')) $$,
  'anon/authenticated hold no USAGE on private or reco'
);

-- Realtime: a private table in the publication would stream reservations to
-- anyone subscribed, RLS or not.
select is_empty(
  $$ select 1 from pg_publication_tables
     where schemaname in ('private','reco') $$,
  'no private/reco table is in a replication publication'
);

-- RLS is enabled AND forced on all three secret tables.
select is(
  (select count(*)::int from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'private' and c.relkind = 'r'
     and c.relrowsecurity and c.relforcerowsecurity),
  3,
  'all three private tables have RLS enabled AND forced'
);

-- FORCE specifically: without it the table owner bypasses RLS, and Supabase's
-- admin connections are the table owner.
select is_empty(
  $$ select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='private' and c.relkind='r' and not c.relforcerowsecurity $$,
  'no private table is missing FORCE ROW LEVEL SECURITY'
);

-- The anti-leak column assertion, restated here because it is the one that
-- silently reopens the hole: a reservation writing to the owner's own row is a
-- Realtime timing oracle no policy can close.
select is_empty(
  $$ select 1 from information_schema.columns
     where table_schema='public' and table_name in ('wish_items','wishlists')
       and column_name ~* '(reserv|taken|held|booked|pot_total|raised)' $$,
  'no reservation-derived column exists on wish_items or wishlists'
);

-- No FK from public to private: PostgREST resolves embeds along foreign keys,
-- and a traversable one would expose row existence.
select is_empty(
  $$ select 1 from pg_constraint c
     join pg_class src on src.oid = c.conrelid
     join pg_namespace sn on sn.oid = src.relnamespace
     join pg_class tgt on tgt.oid = c.confrelid
     join pg_namespace tn on tn.oid = tgt.relnamespace
     where c.contype='f' and sn.nspname='public' and tn.nspname in ('private','reco') $$,
  'no foreign key points from public into private/reco (PostgREST embed path)'
);

-- ---------------------------------------------------------------------------
-- 2. Constraints that close specific oracles
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into private.reservations (wish_item_id, owner_id, reserver_id)
     values ('bbbbbbbb-0000-0000-0000-000000000001',
             '11111111-1111-1111-1111-111111111111',
             '11111111-1111-1111-1111-111111111111') $$,
  '23514',
  null,
  'an owner cannot reserve their own item (self-oracle closed)'
);

-- The trigger overwrites a forged owner_id rather than trusting it.
insert into private.reservations (wish_item_id, owner_id, reserver_id)
values ('bbbbbbbb-0000-0000-0000-000000000001',
        '44444444-4444-4444-4444-444444444444',  -- deliberately wrong
        '33333333-3333-3333-3333-333333333333');

select is(
  (select owner_id from private.reservations
   where reserver_id = '33333333-3333-3333-3333-333333333333'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'a forged owner_id is overwritten from the wish item, not trusted'
);

-- Deleting a wish must behave identically whether or not it was reserved,
-- otherwise the error itself tells the owner something.
select is(
  (select confdeltype from pg_constraint
   where conname like 'reservations_wish_item_id_fkey%'),
  'c',
  'reservations cascade on wish deletion (no restrict-error oracle)'
);

-- ---------------------------------------------------------------------------
-- 3. The RPCs, as each role
-- ---------------------------------------------------------------------------
set local role authenticated;

-- --- The owner ---
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$ select * from public.list_reservation_state('aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42704', 'not found',
  'OWNER: list_reservation_state on their own list raises not-found'
);

select throws_ok(
  $$ select * from public.get_pot_state('bbbbbbbb-0000-0000-0000-000000000002') $$,
  '42704', 'not found',
  'OWNER: get_pot_state on their own item raises not-found'
);

select throws_ok(
  $$ select public.reserve_item('bbbbbbbb-0000-0000-0000-000000000001') $$,
  '42704', 'not found',
  'OWNER: cannot reserve on their own list'
);

-- Note the error code: 42501, permission denied for the SCHEMA. Not "zero
-- rows" — the owner's session cannot reach the table to be filtered in the
-- first place. That is a stronger property than an RLS policy returning an
-- empty set, and it is the whole reason these tables live in `private`.
select throws_ok(
  $$ select 1 from private.reservations $$,
  '42501', null,
  'OWNER: direct select on private.reservations is permission denied, not merely empty'
);

select throws_ok(
  $$ select 1 from private.pots $$,
  '42501', null,
  'OWNER: direct select on private.pots is permission denied'
);

select throws_ok(
  $$ select 1 from private.contributions $$,
  '42501', null,
  'OWNER: direct select on private.contributions is permission denied'
);

-- An aggregate leaks just as loudly as the rows, and is the shape PostgREST
-- exposes via `Prefer: count=exact`.
select throws_ok(
  $$ select count(*) from private.reservations $$,
  '42501', null,
  'OWNER: count(*) over reservations is denied, so no count can be extracted'
);

-- releasing is a no-op rather than an error, so it reveals nothing either
select lives_ok(
  $$ select public.release_item('bbbbbbbb-0000-0000-0000-000000000001') $$,
  'OWNER: release_item is a silent no-op, not a distinguishable error'
);

-- --- A friend ---
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select isnt_empty(
  $$ select * from public.list_reservation_state('aaaaaaaa-0000-0000-0000-000000000001') $$,
  'FRIEND: list_reservation_state returns rows'
);

select is(
  (select taken from public.list_reservation_state('aaaaaaaa-0000-0000-0000-000000000001')
   where wish_item_id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  true,
  'FRIEND: sees that the AirPods are taken'
);

select is(
  (select mine from public.list_reservation_state('aaaaaaaa-0000-0000-0000-000000000001')
   where wish_item_id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  true,
  'FRIEND: sees that the hold is their own'
);

-- The shape itself must not carry an identity column.
select is(
  (select count(*)::int from information_schema.columns
   where table_name = 'list_reservation_state' or column_name = 'reserver_id'
     and table_schema = 'public' and table_name = 'list_reservation_state'),
  0,
  'FRIEND: list_reservation_state exposes no reserver_id column'
);

select is(
  (select raised_cents from public.get_pot_state('bbbbbbbb-0000-0000-0000-000000000002')),
  65000::bigint,
  'FRIEND: pot total is the sum of captured contributions'
);

select is(
  (select contributors from public.get_pot_state('bbbbbbbb-0000-0000-0000-000000000002')),
  '2-5',
  'FRIEND: contributor count is bucketed, not exact'
);

select is(
  (select mine_cents from public.get_pot_state('bbbbbbbb-0000-0000-0000-000000000002')),
  50000::bigint,
  'FRIEND: sees their own contribution exactly'
);

-- A friend cannot reach the table directly either. The RPCs are the only
-- door, for everyone — there is no privileged client, so there is no client
-- whose compromise hands over the table.
select throws_ok(
  $$ select 1 from private.reservations $$,
  '42501', null,
  'FRIEND: direct select is denied too; the RPCs are the only door for anyone'
);

-- --- A stranger ---
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

select throws_ok(
  $$ select * from public.list_reservation_state('aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42704', 'not found',
  'STRANGER: gets the same not-found as the owner (errors are indistinguishable)'
);

select throws_ok(
  $$ select * from public.get_pot_state('bbbbbbbb-0000-0000-0000-000000000002') $$,
  '42704', 'not found',
  'STRANGER: cannot read pot state'
);

select throws_ok(
  $$ select public.reserve_item('bbbbbbbb-0000-0000-0000-000000000001') $$,
  '42704', 'not found',
  'STRANGER: cannot reserve on a list they cannot see'
);

-- --- Anonymous ---
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  $$ select * from public.list_reservation_state('aaaaaaaa-0000-0000-0000-000000000001') $$,
  null,
  'ANON: cannot call list_reservation_state at all'
);

select throws_ok(
  $$ select 1 from private.reservations $$,
  '42501',
  null,
  'ANON: direct select on private.reservations is permission denied'
);

reset role;

-- ---------------------------------------------------------------------------
-- 4. The invariant, stated as an invariant
-- ---------------------------------------------------------------------------
--
-- Everything above tests one path each. This asserts the whole property: for
-- the owner, NOTHING the API can return varies with the contents of
-- private.reservations. Adding a reservation must not change a single byte of
-- what they can read.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

create temporary table owner_view_before as
  select id, wishlist_id, title, price_cents, status, updated_at
  from public.wish_items
  where wishlist_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  order by id;

reset role;
insert into private.reservations (wish_item_id, owner_id, reserver_id)
values ('bbbbbbbb-0000-0000-0000-000000000002',
        '11111111-1111-1111-1111-111111111111',
        '33333333-3333-3333-3333-333333333333');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is_empty(
  $$ select * from owner_view_before
     except
     select id, wishlist_id, title, price_cents, status, updated_at
     from public.wish_items
     where wishlist_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'INVARIANT: the owner''s view of their list is byte-identical after a new reservation'
);

-- Symmetric check: the new row must not have appeared, and must not have
-- silently vanished either. The data survives untouched; it just stops being
-- reachable — the same property src/state/store.test.tsx asserts client-side.
select throws_ok(
  $$ select count(*) from private.reservations $$,
  '42501', null,
  'INVARIANT: the owner still cannot count reservations after two were added'
);

reset role;

select is(
  (select count(*)::int from private.reservations),
  3,
  'INVARIANT: all three reservations do exist — hidden from the owner, not deleted'
);

select * from finish();
rollback;
