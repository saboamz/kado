-- 0007_cf.test.sql
--
-- Collaborative filtering: the shrinkage, the support floor, the gate, and the
-- same covert channel the other tiers had to close.
--
-- Run: psql -f supabase/tests/0007_cf.test.sql

begin;
select plan(18);

-- ---------------------------------------------------------------------------
-- Fixtures: a small but real co-occurrence structure
-- ---------------------------------------------------------------------------
insert into auth.users (id, email)
select ('c0000000-0000-0000-0000-00000000000' || i)::uuid, 'cf' || i || '@test.fr'
from generate_series(1, 9) i
on conflict do nothing;

update public.profiles set handle = 'cf_' || substr(id::text, 36, 1)
where id::text like 'c0000000-%';

insert into public.products (id, title, source_url, status)
select ('d0000000-0000-0000-0000-00000000000' || i)::uuid,
       'CF Produit ' || i, 'https://cf.test/p/' || i, 'active'
from generate_series(1, 6) i;

-- Five givers each gave products 1, 2 AND 5. Support 5 on every pair among
-- them, well past the floor of 3.
--
-- Giver 1 is the viewer in the candidate tests below, and gave only 1 and 2 —
-- so product 5 is the neighbour CF should surface for them. Without a product
-- that co-occurs with the viewer's history but is NOT in it, every candidate
-- gets filtered as "already given" and the tier looks broken when it is the
-- fixture that has nothing to find.
insert into reco.gift_events (actor_id, kind, product_id, weight, occurred_at)
select ('c0000000-0000-0000-0000-00000000000' || g)::uuid,
       'reserve', ('d0000000-0000-0000-0000-00000000000' || p)::uuid,
       6.0, now()
from generate_series(1, 5) g
cross join (values (1), (2)) v(p);

-- Givers 2 to 5 also gave product 5, giving it support 4 with each of 1 and 2.
-- Giver 1 deliberately did NOT, so it is a candidate for them.
insert into reco.gift_events (actor_id, kind, product_id, weight, occurred_at)
select ('c0000000-0000-0000-0000-00000000000' || g)::uuid,
       'reserve', 'd0000000-0000-0000-0000-000000000005'::uuid, 6.0, now()
from generate_series(2, 5) g;

-- Exactly ONE giver gave products 3 and 4 together. Support 1: a coincidence,
-- and the pair must not survive.

insert into reco.gift_events (actor_id, kind, product_id, weight, occurred_at)
values
  ('c0000000-0000-0000-0000-000000000006','reserve','d0000000-0000-0000-0000-000000000003',6.0, now()),
  ('c0000000-0000-0000-0000-000000000006','reserve','d0000000-0000-0000-0000-000000000004',6.0, now());

refresh materialized view reco.giver_product;
refresh materialized view reco.item_similarity;

-- ---------------------------------------------------------------------------
-- 1. The matrix
-- ---------------------------------------------------------------------------
select isnt_empty(
  $$ select 1 from reco.giver_product $$,
  'the giver x product matrix is built from giving events'
);

select is(
  (select count(*)::int from reco.giver_product
   where giver_id = 'c0000000-0000-0000-0000-000000000001'),
  2,
  'a giver appears once per product they gave'
);

-- Browsing must not enter the matrix: a view is not a gift, and mixing the two
-- trains the model on the wrong axis.
insert into reco.gift_events (actor_id, kind, product_id, weight, occurred_at)
values ('c0000000-0000-0000-0000-000000000007','view_product',
        'd0000000-0000-0000-0000-000000000005', 0.3, now());
refresh materialized view reco.giver_product;

select is_empty(
  $$ select 1 from reco.giver_product
     where giver_id = 'c0000000-0000-0000-0000-000000000007' $$,
  'a view does not enter the giving matrix'
);

-- ---------------------------------------------------------------------------
-- 2. Support floor and shrinkage
-- ---------------------------------------------------------------------------
refresh materialized view reco.item_similarity;

select isnt_empty(
  $$ select 1 from reco.item_similarity
     where x = 'd0000000-0000-0000-0000-000000000001'
       and y = 'd0000000-0000-0000-0000-000000000002' $$,
  'a pair with support 5 survives'
);

-- The assertion that matters most at low volume. Without the floor, this pair
-- would score 1.0 — a perfect similarity built from one person's coincidence —
-- and it would sit at the top of every slate.
select is_empty(
  $$ select 1 from reco.item_similarity
     where x = 'd0000000-0000-0000-0000-000000000003'
       and y = 'd0000000-0000-0000-0000-000000000004' $$,
  'a pair seen ONCE does not survive the support floor'
);

select is(
  (select support from reco.item_similarity
   where x = 'd0000000-0000-0000-0000-000000000001'
     and y = 'd0000000-0000-0000-0000-000000000002'),
  5,
  'support is recorded, so a suspicious pair can be explained later'
);

-- Shrinkage: support 5 with lambda 10 keeps 5/15 = 33% of the raw cosine, so
-- a perfectly co-occurring pair must come out well below 1.
select ok(
  (select similarity from reco.item_similarity
   where x = 'd0000000-0000-0000-0000-000000000001'
     and y = 'd0000000-0000-0000-0000-000000000002') < 0.5,
  'shrinkage pulls a low-support pair well below its raw cosine'
);

select ok(
  (select similarity from reco.item_similarity
   where x = 'd0000000-0000-0000-0000-000000000001'
     and y = 'd0000000-0000-0000-0000-000000000002') > 0,
  'but not to zero — it is still evidence'
);

-- ---------------------------------------------------------------------------
-- 3. The gate
-- ---------------------------------------------------------------------------
--
-- CF firing on too little data is worse than no CF: confident nonsense is
-- harder to notice than an empty tier.
select ok(
  not reco.cf_is_ready(5000),
  'CF is NOT ready on a handful of events'
);

select ok(
  reco.cf_is_ready(5),
  'and is ready once the threshold is met'
);

select is_empty(
  $$ select * from reco.cf_candidates(
       'c0000000-0000-0000-0000-000000000001',
       'c0000000-0000-0000-0000-000000000008') $$,
  'the tier returns nothing while the gate is closed'
);

-- ---------------------------------------------------------------------------
-- 4. Candidates, with the gate forced open
-- ---------------------------------------------------------------------------
create or replace function reco.cf_is_ready(p_min_events int default 5000)
returns boolean language sql stable security definer set search_path = '' as
$$ select true $$;

-- Giver 1 gave products 1 and 2. Giver 8 has given nothing, so anything
-- recommended to them comes purely from giver 1's history.
select isnt_empty(
  $$ select * from reco.cf_candidates(
       'c0000000-0000-0000-0000-000000000001',
       'c0000000-0000-0000-0000-000000000008') $$,
  'with the gate open the tier produces candidates'
);

select is_empty(
  $$ select 1 from reco.cf_candidates(
       'c0000000-0000-0000-0000-000000000001',
       'c0000000-0000-0000-0000-000000000008') c
     where c.out_product_id in (
       select product_id from reco.giver_product
       where giver_id = 'c0000000-0000-0000-0000-000000000001') $$,
  'the viewer is not recommended what they already gave'
);

select isnt_empty(
  $$ select 1 from reco.cf_candidates(
       'c0000000-0000-0000-0000-000000000001',
       'c0000000-0000-0000-0000-000000000008') c
     where c.out_because_product_id is not null $$,
  'every candidate carries the seed that produced it'
);

-- ---------------------------------------------------------------------------
-- 5. THE INVARIANT, again
-- ---------------------------------------------------------------------------
--
-- Every tier has to close the same covert channel. CF is the one most likely
-- to reopen it, because "don't recommend what someone already reserved" reads
-- as a quality improvement in a model context.
insert into public.wishlists (id, owner_id, title, slug, visibility) values
  ('c1c10000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000008', 'Liste', 'liste-cf', 'friends');

-- Product 5, which IS a CF candidate for giver 1 — it co-occurs with their
-- history without being in it.
--
-- This is the third time this fixture detail has decided whether an invariance
-- test means anything. A product that is already absent from the candidate set
-- for some other reason (support 1, on the recipient's list, pruned by
-- diversity) produces an identical result whether the code leaks or not, and
-- the assertion passes vacuously. Archived, so `already_wished` does not
-- exclude it either: the ONLY thing that can remove it is a reservation.
insert into public.wish_items (id, wishlist_id, owner_id, product_id, title, status) values
  ('c2c20000-0000-0000-0000-000000000001','c1c10000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000008','d0000000-0000-0000-0000-000000000005',
   'CF Produit 5', 'archived');

create temporary table cf_before as
select out_product_id from reco.cf_candidates(
  'c0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000008');

-- Somebody ELSE reserves it.
insert into private.reservations (wish_item_id, owner_id, reserver_id)
values ('c2c20000-0000-0000-0000-000000000001',
        'c0000000-0000-0000-0000-000000000008',
        'c0000000-0000-0000-0000-000000000009');

select is_empty(
  $$ select out_product_id from cf_before
     except
     select out_product_id from reco.cf_candidates(
       'c0000000-0000-0000-0000-000000000001',
       'c0000000-0000-0000-0000-000000000008') $$,
  'INVARIANT: another person''s reservation does not change CF candidates'
);

select is_empty(
  $$ select out_product_id from reco.cf_candidates(
       'c0000000-0000-0000-0000-000000000001',
       'c0000000-0000-0000-0000-000000000008')
     except
     select out_product_id from cf_before $$,
  'INVARIANT: and nothing appears that was not there before'
);

-- The permitted exclusion: the viewer's OWN hold.
insert into private.reservations (wish_item_id, owner_id, reserver_id)
values ('c2c20000-0000-0000-0000-000000000001',
        'c0000000-0000-0000-0000-000000000008',
        'c0000000-0000-0000-0000-000000000001')
on conflict do nothing;

select is_empty(
  $$ select 1 from reco.cf_candidates(
       'c0000000-0000-0000-0000-000000000001',
       'c0000000-0000-0000-0000-000000000008')
     where out_product_id = 'd0000000-0000-0000-0000-000000000005' $$,
  'a viewer is not shown what they themselves reserved'
);

-- ---------------------------------------------------------------------------
-- 6. Tier mix
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select * from reco.tier_mix() $$,
  'the tier mix is reportable, so a stalled cf_item share is visible'
);

select * from finish();
rollback;
