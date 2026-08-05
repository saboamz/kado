-- dedup-corpus.sql
--
-- Measures how well the catalogue collapses the same product to one row.
--
-- WHY THIS EXISTS, AND WHY IT RUNS BEFORE ANY RECOMMENDER
--
-- Collaborative filtering learns from co-occurrence: two people wanting the
-- same thing is a signal only if it resolves to the SAME products row. If one
-- product fragments into three rows, its co-occurrence splits three ways, no
-- pair reaches the support threshold, and CF returns nothing useful.
--
-- The failure mode that costs months is that this looks like a model problem.
-- The recommender is tuned, the similarity metric is swapped, the shrinkage is
-- retuned — and the actual cause is that `?utm_source=` was not stripped. So
-- the fragmentation rate is measured here, before the model exists, and the
-- number is the gate.
--
-- Run: psql -f supabase/tests/dedup-corpus.sql

begin;
select plan(16);

-- ---------------------------------------------------------------------------
-- The corpus
-- ---------------------------------------------------------------------------
-- Pairs of URLs that SHOULD collapse to one product, and pairs that must NOT.
-- Drawn from the shapes real merchants actually serve.
create temporary table corpus (
  id          serial primary key,
  label       text not null,
  url_a       text not null,
  url_b       text not null,
  should_match boolean not null
) on commit drop;

insert into corpus (label, url_a, url_b, should_match) values
  -- Tracking noise: the single biggest source of fragmentation, because every
  -- share, ad click and newsletter adds a different parameter.
  ('utm campaign',
   'https://www.apple.com/fr/airpods-pro',
   'https://www.apple.com/fr/airpods-pro?utm_source=newsletter&utm_medium=email',
   true),
  ('google click id',
   'https://www.fnac.com/a12345/chemex',
   'https://www.fnac.com/a12345/chemex?gclid=Cj0KCQiA',
   true),
  ('facebook click id',
   'https://shop.fr/p/vase',
   'https://shop.fr/p/vase?fbclid=IwAR0x',
   true),
  ('mailchimp',
   'https://shop.fr/p/vase',
   'https://shop.fr/p/vase?mc_cid=abc&mc_eid=def',
   true),

  -- Cosmetic differences in the URL itself.
  ('scheme',   'http://shop.fr/p/1',  'https://shop.fr/p/1',      true),
  ('www',      'https://shop.fr/p/1', 'https://www.shop.fr/p/1',  true),
  ('trailing slash', 'https://shop.fr/p/1', 'https://shop.fr/p/1/', true),
  ('fragment', 'https://shop.fr/p/1', 'https://shop.fr/p/1#avis', true),
  ('case',     'https://SHOP.fr/p/1', 'https://shop.fr/p/1',      true),
  -- Parameter order: ?color=noir&size=m and ?size=m&color=noir are one page.
  ('param order',
   'https://shop.fr/p?color=noir&size=m',
   'https://shop.fr/p?size=m&color=noir',
   true),

  -- Genuinely different products that must stay apart. Over-merging is worse
  -- than under-merging: it puts the wrong item on someone's list.
  ('different path',  'https://shop.fr/p/1', 'https://shop.fr/p/2', false),
  ('different variant',
   'https://shop.fr/p?color=noir',
   'https://shop.fr/p?color=blanc',
   false),
  ('different host',  'https://shop.fr/p/1', 'https://autre.fr/p/1', false),
  -- The regression the tracking-param regex nearly caused: a prefix match on
  -- `ref` also eats `refresh`, `reference` and `refurbished`, which are real
  -- product parameters.
  ('refurbished flag',
   'https://shop.fr/p/1?refurbished=1',
   'https://shop.fr/p/1',
   false);

-- ---------------------------------------------------------------------------
-- Per-pair assertions
-- ---------------------------------------------------------------------------
-- One assertion per pair, as a set-returning select rather than a DO block:
-- `perform ok(...)` runs the assertion but discards its row, so pgTAP counts
-- it while emitting nothing — and a suite whose output does not match its plan
-- is a suite nobody can read.
select ok(
  case when should_match
       then public.normalize_url(url_a) = public.normalize_url(url_b)
       else public.normalize_url(url_a) is distinct from public.normalize_url(url_b)
  end,
  format('%s: %s', label,
         case when should_match then 'collapses' else 'stays distinct' end)
)
from corpus
order by id;

-- ---------------------------------------------------------------------------
-- The headline numbers
-- ---------------------------------------------------------------------------
--
-- These are what to watch over time. The plan's warning, restated: if the
-- median number of distinct users per product stagnates at 1 while wish counts
-- climb, deduplication is broken and no amount of model work will help.
create temporary view dedup_report as
select
  count(*) filter (where should_match) as should_collapse,
  count(*) filter (
    where should_match
      and public.normalize_url(url_a) = public.normalize_url(url_b)
  ) as did_collapse,
  count(*) filter (where not should_match) as should_stay_apart,
  count(*) filter (
    where not should_match
      and public.normalize_url(url_a) is distinct from public.normalize_url(url_b)
  ) as did_stay_apart
from corpus;

-- No false negatives: every pair that should merge, merges.
select is(
  (select did_collapse from dedup_report),
  (select should_collapse from dedup_report),
  'recall: every pair that should collapse does'
);

-- No false positives, which matter more. A missed merge costs signal; a wrong
-- merge puts someone else's product on a wishlist.
select is(
  (select did_stay_apart from dedup_report),
  (select should_stay_apart from dedup_report),
  'precision: no pair of different products is merged'
);

\echo ''
\echo '--- deduplication report ---'
select
  should_collapse,
  did_collapse,
  round(100.0 * did_collapse / nullif(should_collapse, 0), 1) as recall_pct,
  should_stay_apart,
  did_stay_apart,
  round(100.0 * did_stay_apart / nullif(should_stay_apart, 0), 1) as precision_pct
from dedup_report;

select * from finish();
rollback;
