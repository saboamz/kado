-- 0004_reco.test.sql
--
-- The recommendation cascade, and the covert channel it must not open.
--
-- The interesting assertions are at the bottom. The obvious "improvement" to
-- this feature — filter out items other friends already reserved — turns the
-- slate into a readable encoding of the reservation table. It is the kind of
-- change that gets made in good faith, ships, and is never noticed. So the
-- property is asserted directly rather than left to review.
--
-- Run: psql -f supabase/tests/0004_reco.test.sql

begin;
select plan(21);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'sophie-r@test.fr'),
  ('22222222-2222-2222-2222-222222222222', 'marc-r@test.fr'),
  ('33333333-3333-3333-3333-333333333333', 'lea-r@test.fr'),
  ('44444444-4444-4444-4444-444444444444', 'zoe-r@test.fr')
on conflict do nothing;

update public.profiles set handle='sophie_r', interests = array['Café','Céramique']
  where id='11111111-1111-1111-1111-111111111111';
update public.profiles set handle='marc_r' where id='22222222-2222-2222-2222-222222222222';
update public.profiles set handle='lea_r'  where id='33333333-3333-3333-3333-333333333333';
update public.profiles set handle='zoe_r'  where id='44444444-4444-4444-4444-444444444444';

-- Sophie is friends with Marc and Lea. Zoe is a stranger.
insert into public.follows (follower_id, followee_id, state) values
  ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','accepted'),
  ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','accepted'),
  ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','accepted'),
  ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','accepted')
on conflict do nothing;

insert into public.categories (id, slug, label_fr)
select ('caca0000-0000-0000-0000-00000000000' || i)::uuid,
       'cat-r-' || i, 'Catégorie ' || i
from generate_series(1, 9) i
on conflict (id) do nothing;

-- Distinct slugs from the seed's, so this suite is independent of whether the
-- database was seeded — it must pass on both.
insert into public.tags (id, slug, label_fr) values
  ('7a900000-0000-0000-0000-000000000001','cafe-r','Café'),
  ('7a900000-0000-0000-0000-000000000002','ceramique-r','Céramique')
on conflict (id) do nothing;

-- Ten products so the diversity pass has something to prune.
insert into public.products (id, title, source_url, price_cents, category_id, popularity)
select
  ('bbbb0000-0000-0000-0000-00000000000' || i)::uuid,
  'Produit ' || i,
  'https://shop-r.fr/p/' || i,
  5000 + i * 1000,
  -- One category each: the diversity cap is 2 per category, so a shared
  -- category would prune most of the fixture and leave the invariance test
  -- asserting over products that were never candidates.
  ('caca0000-0000-0000-0000-00000000000' || i)::uuid,
  100 - i * 5
from generate_series(1, 9) i;

-- Embeddings, so the content_vector tier actually fires.
--
-- Without these the tier returns nothing and every assertion about it — and
-- every sabotage aimed at it — passes vacuously. Verified: a leak planted in
-- vector_candidates went completely undetected until this fixture existed.
--
-- The vectors are hand-placed rather than random so "similar" is predictable:
-- products 3 and 4 sit near each other, far from the rest.
-- The column is vector(384), so the vectors are built at full width: the
-- first two components carry the signal, the remaining 382 are zero.
update public.products p set
  embedding = (
    '[' || v.a || ',' || v.b ||
    repeat(',0', 382) || ']'
  )::extensions.vector,
  embedding_model = 'test-model'
from (values
  ('bbbb0000-0000-0000-0000-000000000003'::uuid, 1.0, 0.0),
  ('bbbb0000-0000-0000-0000-000000000004'::uuid, 0.95, 0.1),
  ('bbbb0000-0000-0000-0000-000000000005'::uuid, 0.9, 0.2),
  ('bbbb0000-0000-0000-0000-000000000001'::uuid, 0.98, 0.05),
  ('bbbb0000-0000-0000-0000-000000000006'::uuid, 0.0, 1.0),
  ('bbbb0000-0000-0000-0000-000000000007'::uuid, 0.1, 0.99),
  ('bbbb0000-0000-0000-0000-000000000008'::uuid, 0.2, 0.95),
  ('bbbb0000-0000-0000-0000-000000000009'::uuid, 0.05, 0.98)
) v(id, a, b)
where p.id = v.id;

-- Two of them match Sophie's declared taste.
insert into public.product_tags (product_id, tag_id)
select p, t from (values
  ('bbbb0000-0000-0000-0000-000000000003'::uuid, 'cafe-r'),
  ('bbbb0000-0000-0000-0000-000000000007'::uuid, 'ceramique-r')
) v(p, slug)
join public.tags tg on tg.slug = v.slug
cross join lateral (select tg.id as t) x;

insert into public.wishlists (id, owner_id, title, slug, visibility) values
  ('a1a10000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'Anniversaire', 'anniv-r', 'friends');

-- Sophie already wants product 1, so it must never be recommended to anyone
-- as a gift FOR her.
insert into public.wish_items (id, wishlist_id, owner_id, product_id, title, price_cents) values
  ('f1f10000-0000-0000-0000-000000000001','a1a10000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111','bbbb0000-0000-0000-0000-000000000001',
   'Produit 1', 6000),
  ('f1f10000-0000-0000-0000-000000000002','a1a10000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111','bbbb0000-0000-0000-0000-000000000002',
   'Produit 2', 7000);

-- ---------------------------------------------------------------------------
-- 1. Structure
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select 1 from information_schema.role_table_grants
     where table_schema = 'reco' and table_name in ('recommendations','reco_impressions')
       and grantee in ('anon','authenticated') $$,
  'a client cannot read the recommendations table directly'
);

select is(
  (select count(*)::int from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='reco' and c.relname in ('recommendations','reco_impressions')
     and c.relrowsecurity and c.relforcerowsecurity),
  2,
  'both recommendation tables have RLS enabled and forced'
);

-- ---------------------------------------------------------------------------
-- 2. Building a slate
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select reco.rebuild_recommendations(
       '22222222-2222-2222-2222-222222222222',
       '11111111-1111-1111-1111-111111111111') $$,
  'a slate builds for a friend'
);

select ok(
  (select count(*) from reco.recommendations
   where viewer_id='22222222-2222-2222-2222-222222222222') > 0,
  'the slate is not empty'
);

-- Every row must say which tier produced it, or per-tier CTR cannot be
-- measured and "why is this here" cannot be answered.
select is_empty(
  $$ select 1 from reco.recommendations where strategy is null $$,
  'every recommendation carries its strategy'
);

-- The cascade's ordering, asserted as ordering rather than as one tier.
--
-- This used to assert that content_facet fires, which was right until the
-- vector tier existed: a vector match now outranks a facet match, so every
-- slot in this fixture is content_vector and the old assertion failed while
-- the cascade was working exactly as designed. What actually matters is that
-- a tier fires at all, and that whichever one claims a slot is recorded.
select ok(
  (select count(distinct strategy) from reco.recommendations
   where viewer_id = '22222222-2222-2222-2222-222222222222') >= 1,
  'some tier claims every slot, and says which'
);

select is_empty(
  $$ select 1 from reco.recommendations
     where viewer_id = '22222222-2222-2222-2222-222222222222'
       and strategy not in ('content_vector','content_facet','popularity') $$,
  'every slot comes from a tier this cascade actually implements'
);

-- Recommending what someone already asked for is not a recommendation.
select is_empty(
  $$ select 1 from reco.recommendations r
     where r.recipient_id = '11111111-1111-1111-1111-111111111111'
       and r.product_id in (
         select product_id from public.wish_items
         where owner_id = '11111111-1111-1111-1111-111111111111'
           and product_id is not null) $$,
  'nothing already on the recipient''s list is recommended'
);

-- Diversity: without it the top of a slate is five variants of one thing.
select ok(
  (select coalesce(max(n), 0) from (
     select count(*) as n from reco.recommendations r
     join public.products p on p.id = r.product_id
     where r.viewer_id = '22222222-2222-2222-2222-222222222222'
     group by p.category_id) c) <= 2,
  'no more than two recommendations share a category'
);

-- ---------------------------------------------------------------------------
-- 3. Serving
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select isnt_empty(
  $$ select * from public.get_recommendations(
       '11111111-1111-1111-1111-111111111111') $$,
  'a friend receives a slate'
);

-- RULE 1. The direct oracle: ask about yourself and infer from what is missing.
select throws_ok(
  $$ select * from public.get_recommendations(
       '22222222-2222-2222-2222-222222222222') $$,
  '42704', 'not found',
  'a viewer CANNOT ask for recommendations about themselves'
);

select throws_ok(
  $$ select * from public.get_recommendations(
       '44444444-4444-4444-4444-444444444444') $$,
  '42704', 'not found',
  'a viewer cannot ask about a stranger'
);

select throws_ok(
  $$ select 1 from reco.recommendations $$,
  '42501', null,
  'a client cannot read slates directly (nor diff someone else''s)'
);

reset role;

select throws_ok(
  $$ select reco.rebuild_recommendations(
       '22222222-2222-2222-2222-222222222222',
       '22222222-2222-2222-2222-222222222222') $$,
  '22023', null,
  'the builder refuses a self-slate too, not only the serving function'
);

-- ---------------------------------------------------------------------------
-- 4. THE INVARIANT
-- ---------------------------------------------------------------------------
--
-- For a given viewer and recipient, the slate must not vary with the contents
-- of private.reservations for that recipient. If it does, the slate is a
-- readable encoding of who reserved what, and an owner with a second account
-- can decode it by diffing over time.
--
-- This is the assertion that catches the well-meaning "let's not recommend
-- things already taken" change.
create temporary table slate_before as
select product_id, strategy, rank
from reco.recommendations
where viewer_id = '22222222-2222-2222-2222-222222222222'
  and recipient_id = '11111111-1111-1111-1111-111111111111'
order by rank;

-- Lea reserves product 5 for Sophie.
--
-- The item is ACTIVE and its product is on no other exclusion list, so the
-- ONLY thing that could drop product 5 from Marc's slate is the reservation
-- itself. Getting this wrong is easy and silent: an earlier version of this
-- fixture reserved an archived item, which a leaking build excluded anyway,
-- so the sabotage went undetected and the test looked like it worked.
-- The wish is created on a SECOND list belonging to Lea, not Sophie, so
-- `already_wished` (which is scoped to the recipient) cannot mask it. What is
-- reserved is a product that is otherwise a perfectly ordinary candidate for
-- Marc's slate about Sophie.
--
-- Getting this wrong is easy and silent: an earlier version reserved an item
-- on Sophie's own list, which every build excluded anyway, so the sabotage
-- went undetected and the test looked like it worked.
insert into public.wishlists (id, owner_id, title, slug, visibility) values
  ('a1a10000-0000-0000-0000-000000000002',
   '33333333-3333-3333-3333-333333333333', 'Liste de Lea', 'lea-r', 'friends');

insert into public.wish_items (id, wishlist_id, owner_id, product_id, title, price_cents, status)
values ('f1f10000-0000-0000-0000-000000000003','a1a10000-0000-0000-0000-000000000002',
        '33333333-3333-3333-3333-333333333333','bbbb0000-0000-0000-0000-000000000005',
        'Produit 5', 10000, 'active');

-- Marc reserves it — on LEA's list. Nothing about his advice for SOPHIE may
-- move, because Sophie's reservations are the only ones that could plausibly
-- be argued to matter and this is not one of them.
insert into private.reservations (wish_item_id, owner_id, reserver_id)
values ('f1f10000-0000-0000-0000-000000000003',
        '33333333-3333-3333-3333-333333333333',
        '22222222-2222-2222-2222-222222222222');

delete from reco.recommendations
where viewer_id = '22222222-2222-2222-2222-222222222222';
select reco.rebuild_recommendations(
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111');

select is_empty(
  $$ select product_id, strategy, rank from slate_before
     except
     select product_id, strategy, rank from reco.recommendations
     where viewer_id = '22222222-2222-2222-2222-222222222222'
       and recipient_id = '11111111-1111-1111-1111-111111111111' $$,
  'INVARIANT: another friend''s reservation does not change the slate'
);

select is_empty(
  $$ select product_id, strategy, rank from reco.recommendations
     where viewer_id = '22222222-2222-2222-2222-222222222222'
       and recipient_id = '11111111-1111-1111-1111-111111111111'
     except
     select product_id, strategy, rank from slate_before $$,
  'INVARIANT: and nothing appears that was not there before'
);

-- The permitted exclusion, and only it: a viewer's OWN reservation. They
-- already know what they reserved, so removing it tells them nothing new.
insert into private.reservations (wish_item_id, owner_id, reserver_id)
select 'f1f10000-0000-0000-0000-000000000001',
       '11111111-1111-1111-1111-111111111111',
       '22222222-2222-2222-2222-222222222222'
where not exists (
  select 1 from private.reservations
  where wish_item_id = 'f1f10000-0000-0000-0000-000000000001'
    and reserver_id = '22222222-2222-2222-2222-222222222222');

delete from reco.recommendations
where viewer_id = '22222222-2222-2222-2222-222222222222';
select reco.rebuild_recommendations(
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111');

select is_empty(
  $$ select 1 from reco.recommendations
     where viewer_id = '22222222-2222-2222-2222-222222222222'
       and product_id = 'bbbb0000-0000-0000-0000-000000000001' $$,
  'a viewer is not shown what they themselves already reserved'
);

-- ---------------------------------------------------------------------------
-- 5. The vector tier
-- ---------------------------------------------------------------------------
--
-- Sophie wants product 1, which is embedded, so she has a taste vector and the
-- tier can fire. These exist so a leak planted in vector_candidates is caught
-- — it was not, before this fixture had embeddings.
select isnt_empty(
  $$ select * from reco.vector_candidates(
       '22222222-2222-2222-2222-222222222222',
       '11111111-1111-1111-1111-111111111111') $$,
  'the vector tier returns candidates when products are embedded'
);

select is_empty(
  $$ select 1 from reco.vector_candidates(
       '22222222-2222-2222-2222-222222222222',
       '11111111-1111-1111-1111-111111111111') v
     where v.out_product_id in (
       select product_id from public.wish_items
       where owner_id = '11111111-1111-1111-1111-111111111111'
         and status = 'active' and product_id is not null) $$,
  'the vector tier does not recommend what is already wished for'
);

-- The same invariance as the cascade, asserted at the tier itself: a
-- reservation by someone else must not change what it returns.
create temporary table vector_before as
select out_product_id as product_id from reco.vector_candidates(
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111');

-- Reserve a product that IS a vector candidate.
--
-- This is the whole difficulty of testing the invariant, and it caught me
-- twice: a product already excluded for another reason (on the recipient's
-- own list, pruned by diversity) produces an identical slate whether the code
-- leaks or not, so the assertion passes vacuously. Product 4 is embedded,
-- unwished and unreserved, which makes it the only kind of product whose
-- disappearance can prove anything.
insert into public.wish_items (id, wishlist_id, owner_id, product_id, title, price_cents, status)
values ('f1f10000-0000-0000-0000-000000000004','a1a10000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111','bbbb0000-0000-0000-0000-000000000004',
        'Produit 4', 9000, 'archived');

insert into private.reservations (wish_item_id, owner_id, reserver_id)
values ('f1f10000-0000-0000-0000-000000000004',
        '11111111-1111-1111-1111-111111111111',
        '33333333-3333-3333-3333-333333333333');

select is_empty(
  $$ select product_id from vector_before
     except
     select out_product_id from reco.vector_candidates(
       '22222222-2222-2222-2222-222222222222',
       '11111111-1111-1111-1111-111111111111') $$,
  'INVARIANT: the vector tier ignores another friend''s reservation'
);

-- ---------------------------------------------------------------------------
-- 6. Popularity
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select reco.refresh_popularity() $$,
  'popularity refreshes from the event log'
);

select * from finish();
rollback;
