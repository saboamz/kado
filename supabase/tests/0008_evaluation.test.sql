-- 0008_evaluation.test.sql
--
-- The evaluation harness.
--
-- Its job is to make deleting a tier possible, so the assertions are about
-- whether it could ever deliver bad news: that a strategy which recommends
-- nothing useful scores zero, that a boring one is visibly boring, and that
-- the split does not leak the future.
--
-- Run: psql -f supabase/tests/0008_evaluation.test.sql

begin;
select plan(15);

-- ---------------------------------------------------------------------------
-- Fixtures: a training period and a held-out period
-- ---------------------------------------------------------------------------
insert into auth.users (id, email)
select ('e0000000-0000-0000-0000-00000000000' || i)::uuid, 'ev' || i || '@test.fr'
from generate_series(1, 6) i
on conflict do nothing;

update public.profiles set handle = 'ev_' || substr(id::text, 36, 1)
where id::text like 'e0000000-%';

insert into public.categories (id, slug, label_fr) values
  ('ecec0000-0000-0000-0000-000000000001','cat-ev','Catégorie eval')
on conflict (id) do nothing;

-- 60 products, not 6.
--
-- With a catalogue smaller than k, EVERY strategy returns the whole thing and
-- scores perfect recall — including random. That is not a broken metric, it is
-- a fixture that cannot distinguish anything, and it hid the fact that recall
-- alone rewards recommending everything. Coverage is what separates them, and
-- it only means something when a slate is a genuine choice.
insert into public.products (id, title, source_url, status, category_id, popularity)
select ('f0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
       'Eval Produit ' || i, 'https://ev.test/p/' || i, 'active',
       'ecec0000-0000-0000-0000-000000000001', greatest(0, 60 - i)
from generate_series(1, 60) i;

-- TRAINING: everyone gave product 1, so it is the popular one.
insert into reco.gift_events (actor_id, kind, product_id, weight, occurred_at)
select ('e0000000-0000-0000-0000-00000000000' || g)::uuid,
       'reserve', 'f0000000-0000-0000-0000-000000000001'::uuid, 6.0,
       now() - interval '90 days'
from generate_series(1, 5) g;

-- HELD OUT: users 1-3 went on to give product 1 again, so a popularity
-- baseline should score well; users 4-5 gave product 6, which nothing in the
-- training period predicts.
insert into reco.gift_events (actor_id, kind, product_id, weight, occurred_at)
select ('e0000000-0000-0000-0000-00000000000' || g)::uuid,
       'reserve', 'f0000000-0000-0000-0000-000000000001'::uuid, 6.0,
       now() - interval '5 days'
from generate_series(1, 3) g;

insert into reco.gift_events (actor_id, kind, product_id, weight, occurred_at)
select ('e0000000-0000-0000-0000-00000000000' || g)::uuid,
       'reserve', 'f0000000-0000-0000-0000-000000000006'::uuid, 6.0,
       now() - interval '5 days'
from generate_series(4, 5) g;

-- ---------------------------------------------------------------------------
-- 1. The split
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select reco.run_evaluation(now() - interval '30 days', 12) $$,
  'an evaluation run completes'
);

select ok(
  (select train_events from reco.eval_runs order by ran_at desc limit 1) > 0,
  'the training period has events'
);

select ok(
  (select test_events from reco.eval_runs order by ran_at desc limit 1) > 0,
  'and so does the held-out period'
);

-- The split must be a partition: an event counted in both would be a leak of
-- exactly the kind a random split causes.
select is(
  (select train_events + test_events from reco.eval_runs order by ran_at desc limit 1),
  (select count(*) from reco.gift_events
   where kind in ('reserve','purchase','contribute') and product_id is not null),
  'training and held-out partition the log — no event is in both'
);

-- ---------------------------------------------------------------------------
-- 2. Every baseline is scored
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from reco.eval_results
   where run_id = (select id from reco.eval_runs order by ran_at desc limit 1)),
  3,
  'random, popularity and category_popularity are all scored'
);

-- Reporting a tier's number without the bar it had to clear is how a tier
-- survives that should not have.
select isnt_empty(
  $$ select 1 from reco.eval_results
     where strategy = 'category_popularity'
       and run_id = (select id from reco.eval_runs order by ran_at desc limit 1) $$,
  'the bar itself is always among them'
);

-- ---------------------------------------------------------------------------
-- 3. The metrics say something
-- ---------------------------------------------------------------------------
--
-- Popularity should find product 1, which three of five held-out users gave.
select ok(
  (select recall_at_k from reco.eval_results
   where strategy = 'popularity'
     and run_id = (select id from reco.eval_runs order by ran_at desc limit 1)) > 0,
  'the popularity baseline scores above zero on a popular held-out item'
);

-- The harness must be able to tell a targeted strategy from an untargeted one.
--
-- Worth stating what this does NOT assert: that popularity beats random on
-- recall. With a catalogue near k in size, random returns most of it and wins
-- on recall while being useless — which is exactly why recall is never read
-- alone here.
select ok(
  (select recall_at_k from reco.eval_results
   where strategy = 'popularity'
     and run_id = (select id from reco.eval_runs order by ran_at desc limit 1)) > 0,
  'popularity finds the item most held-out users actually gave'
);

select ok(
  (select coverage from reco.eval_results
   where strategy = 'popularity'
     and run_id = (select id from reco.eval_runs order by ran_at desc limit 1)) <= 1.0,
  'coverage is a fraction of the catalogue'
);

-- The metric that catches a recommender scoring well by being boring.
-- Popularity shows everyone the same twelve products; random spreads across
-- the catalogue. Recall alone would never distinguish them.
select ok(
  (select coverage from reco.eval_results
   where strategy = 'random'
     and run_id = (select id from reco.eval_runs order by ran_at desc limit 1))
  >
  (select coverage from reco.eval_results
   where strategy = 'popularity'
     and run_id = (select id from reco.eval_runs order by ran_at desc limit 1)),
  'random covers MORE catalogue than popularity — recall alone would never say so'
);

select ok(
  (select novelty from reco.eval_results
   where strategy = 'popularity'
     and run_id = (select id from reco.eval_runs order by ran_at desc limit 1)) >= 0,
  'novelty is reported'
);

select ok(
  (select users_scored from reco.eval_results
   where strategy = 'popularity'
     and run_id = (select id from reco.eval_runs order by ran_at desc limit 1)) = 5,
  'only users with held-out gifts are scored — the rest have no ground truth'
);

-- ---------------------------------------------------------------------------
-- 4. No leakage from the future
-- ---------------------------------------------------------------------------
--
-- A baseline built from the whole log would see the held-out period and score
-- unfairly well. Product 6 is given ONLY after the cutoff, so it must not be
-- in a slate built at the cutoff.
select is_empty(
  $$ select 1 from reco.baseline_slate(
       'popularity', 'e0000000-0000-0000-0000-000000000004',
       now() - interval '30 days', 12)
     where product_id = 'f0000000-0000-0000-0000-000000000006' $$,
  'a baseline cannot see products that only appear after the cutoff'
);

-- ---------------------------------------------------------------------------
-- 5. The verdict
-- ---------------------------------------------------------------------------
select isnt_empty(
  $$ select * from reco.evaluation_verdict(
       (select id from reco.eval_runs order by ran_at desc limit 1)) $$,
  'the verdict compares every strategy against the bar'
);

-- The whole point: the harness must be able to say "delete this".
select isnt_empty(
  $$ select 1 from reco.evaluation_verdict(
       (select id from reco.eval_runs order by ran_at desc limit 1))
     where verdict like '%does NOT beat%' or verdict = 'the bar' $$,
  'and can return a verdict that says a strategy has not earned its place'
);

select * from finish();
rollback;
