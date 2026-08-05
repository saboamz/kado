-- 0003_events.test.sql
--
-- The event log: that it records what CF needs, and that a client cannot
-- forge the parts of it that matter.
--
-- Run: psql -f supabase/tests/0003_events.test.sql

begin;
select plan(20);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'sophie-e@test.fr'),
  ('22222222-2222-2222-2222-222222222222', 'marc-e@test.fr'),
  ('33333333-3333-3333-3333-333333333333', 'lea-e@test.fr')
on conflict do nothing;

update public.profiles set handle='sophie_e' where id='11111111-1111-1111-1111-111111111111';
update public.profiles set handle='marc_e'   where id='22222222-2222-2222-2222-222222222222';
update public.profiles set handle='lea_e'    where id='33333333-3333-3333-3333-333333333333';

insert into public.follows (follower_id, followee_id, state) values
  ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','accepted'),
  ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','accepted')
on conflict do nothing;

insert into public.wishlists (id, owner_id, title, slug, visibility) values
  ('eeee0000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'Anniversaire', 'anniv-e', 'friends');

insert into public.products (id, title, source_url, price_cents) values
  ('dddd0000-0000-0000-0000-000000000001', 'AirPods Pro 3',
   'https://apple.com/fr/airpods-e', 27900);

insert into public.wish_items (id, wishlist_id, owner_id, product_id, title, price_cents, is_pot) values
  ('ffff0000-0000-0000-0000-000000000001','eeee0000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111','dddd0000-0000-0000-0000-000000000001',
   'AirPods Pro 3', 27900, false),
  ('ffff0000-0000-0000-0000-000000000002','eeee0000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', null, 'MacBook Air', 159900, true);

insert into private.pots (wish_item_id, owner_id, target_cents) values
  ('ffff0000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111', 159900);

-- ---------------------------------------------------------------------------
-- 1. Structure
-- ---------------------------------------------------------------------------
select has_schema('reco', 'the reco schema exists');

select is_empty(
  $$ select 1 from information_schema.role_table_grants
     where table_schema = 'reco' and grantee in ('anon','authenticated') $$,
  'anon/authenticated hold no privileges on reco tables'
);

select is_empty(
  $$ select 1 from pg_publication_tables where schemaname = 'reco' $$,
  'no reco table is replicated (Realtime would stream reserve events)'
);

-- Phrased as "none unforced" rather than a count: a hardcoded number goes
-- stale the moment the schema grows a table, and it fails in a way that looks
-- like a security regression when it is only arithmetic.
select is_empty(
  $$ select 1 from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'reco' and c.relkind = 'r'
       and not (c.relrowsecurity and c.relforcerowsecurity) $$,
  'every reco table has RLS enabled and forced'
);

-- Every kind the app can emit needs a weight, or events silently default to 1
-- and a purchase counts the same as a page view.
select is(
  (select count(*)::int from unnest(enum_range(null::public.event_kind)) k
   where k not in (select kind from reco.event_weights)),
  0,
  'every event_kind has a configured weight'
);

select ok(
  (select weight from reco.event_weights where kind = 'purchase') >
  (select weight from reco.event_weights where kind = 'view_product'),
  'a purchase outweighs a view'
);

select ok(
  (select weight from reco.event_weights where kind = 'unreserve') < 0,
  'a reversal is negative evidence, not absent evidence'
);

-- ---------------------------------------------------------------------------
-- 2. The whitelist
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select lives_ok(
  $$ select public.log_event('view_product',
       'dddd0000-0000-0000-0000-000000000001') $$,
  'a client may log a browsing event'
);

-- The one that matters. Without this a spammer POSTs purchases in a loop and
-- promotes any product into every recommendation slate — and the model looks
-- healthy while doing it.
select throws_ok(
  $$ select public.log_event('purchase',
       'dddd0000-0000-0000-0000-000000000001') $$,
  '42501', null,
  'a client CANNOT forge a purchase'
);

select throws_ok(
  $$ select public.log_event('reserve',
       'dddd0000-0000-0000-0000-000000000001') $$,
  '42501', null,
  'a client cannot forge a reservation event'
);

select throws_ok(
  $$ select public.log_event('contribute',
       'dddd0000-0000-0000-0000-000000000001') $$,
  '42501', null,
  'a client cannot forge a contribution event'
);

select throws_ok(
  $$ select 1 from reco.gift_events $$,
  '42501', null,
  'a client cannot read the event log directly'
);

-- Back to superuser: `authenticated` genuinely cannot read the log — that is
-- assertion 12 — so verifying what was written has to happen from outside the
-- role, exactly as an operator would.
reset role;

-- The actor is stamped server-side, so a client cannot log as someone else.
select is(
  (select actor_id from reco.gift_events
   where kind = 'view_product' order by id desc limit 1),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'actor_id comes from auth.uid(), not from the caller'
);

-- ---------------------------------------------------------------------------
-- 3. Giving events, recorded by the RPCs that perform the action
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select lives_ok(
  $$ select public.reserve_item('ffff0000-0000-0000-0000-000000000001') $$,
  'a friend reserves'
);

reset role;

select is(
  (select count(*)::int from reco.gift_events
   where kind = 'reserve'
     and actor_id = '22222222-2222-2222-2222-222222222222'
     and product_id = 'dddd0000-0000-0000-0000-000000000001'),
  1,
  'reserving records the giver x product signal CF is built from'
);

-- The price is the one at the time of the event. Joining to products later
-- would read today's price and rewrite history every time a sale runs.
select is(
  (select price_cents from reco.gift_events
   where kind = 'reserve' limit 1),
  27900,
  'the price is captured at the moment of the event'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok(
  $$ select public.contribute('ffff0000-0000-0000-0000-000000000002', 5000) $$,
  'a friend contributes'
);
reset role;

select is(
  (select count(*)::int from reco.gift_events where kind = 'contribute'),
  1,
  'contributing is recorded too'
);

-- ---------------------------------------------------------------------------
-- 4. A reversal only counts when something reversed
-- ---------------------------------------------------------------------------
set local role authenticated;
-- Lea never held this item; releasing it must record nothing, or anyone could
-- manufacture negative signal against any product.
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select lives_ok(
  $$ select public.release_item('ffff0000-0000-0000-0000-000000000001') $$,
  'releasing a gift you never held is a silent no-op'
);
reset role;

select is(
  (select count(*)::int from reco.gift_events
   where kind = 'unreserve'
     and actor_id = '33333333-3333-3333-3333-333333333333'),
  0,
  'a no-op release records no reversal'
);

select * from finish();
rollback;
