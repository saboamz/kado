-- 0019_evaluation.sql
--
-- Offline evaluation: does any of this actually work?
--
-- The point of this file is to make it possible to DELETE a tier. Every
-- recommender ships with an argument for why it should exist; what is rare is
-- the measurement that would show it should not. Without this, cf_item stays
-- in the cascade forever because removing it would feel like going backwards.
--
-- THE SPLIT IS TEMPORAL, NEVER RANDOM.
--
-- A random split puts a user's later gifts in the training set and their
-- earlier ones in the test set, so the model is scored on predicting the past
-- from the future. It inflates every metric, uniformly, and it inflates the
-- weakest models most — which is exactly the wrong direction for a decision
-- about whether to keep something.

-- ---------------------------------------------------------------------------
-- Runs
-- ---------------------------------------------------------------------------
create table reco.eval_runs (
  id           uuid primary key default gen_random_uuid(),
  ran_at       timestamptz not null default now(),
  -- Everything before this is training; everything at or after is held out.
  cutoff       timestamptz not null,
  k            int not null default 12,
  train_events bigint not null,
  test_events  bigint not null,
  notes        text
);

create table reco.eval_results (
  run_id     uuid not null references reco.eval_runs (id) on delete cascade,
  strategy   text not null,
  -- Of the items a user actually gave in the held-out period, what share did
  -- the slate contain? The headline number.
  recall_at_k numeric,
  -- Rewards putting the right answer near the top, not merely in the list.
  map_at_k    numeric,
  ndcg_at_k   numeric,
  -- Fraction of the catalogue ever recommended to anybody.
  --
  -- This is the metric that catches a recommender scoring well by being
  -- boring. A popularity-only system posts respectable recall while showing
  -- the same twenty products to everyone forever, and recall alone will never
  -- say so.
  coverage    numeric,
  -- Mean inverse popularity of what was recommended: are we surfacing
  -- anything people would not have found alone?
  novelty     numeric,
  users_scored bigint,
  primary key (run_id, strategy)
);

alter table reco.eval_runs    enable row level security;
alter table reco.eval_runs    force  row level security;
alter table reco.eval_results enable row level security;
alter table reco.eval_results force  row level security;

comment on table reco.eval_results is
  'Per-strategy offline metrics. Coverage is here because recall alone cannot distinguish a good recommender from a boring one.';

-- ---------------------------------------------------------------------------
-- The baselines CF has to beat, in order
-- ---------------------------------------------------------------------------
--
-- Ordered by how little they know. A model that cannot beat "the same popular
-- things for everybody" has not earned the complexity it costs.
create or replace function reco.baseline_slate(
  p_strategy text,
  p_user uuid,
  p_cutoff timestamptz,
  p_k int default 12
)
returns table (product_id uuid, rank int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_strategy = 'random' then
    return query
    select p.id, row_number() over ()::int
    from public.products p
    where p.status = 'active'
    -- Deterministic pseudo-random: seeded from the user so a rerun of the
    -- same evaluation gives the same answer. An unseeded random() would make
    -- every run differ and nothing comparable.
    order by md5(p.id::text || p_user::text)
    limit p_k;

  elsif p_strategy = 'popularity' then
    return query
    select e.product_id, row_number() over (order by sum(e.weight) desc)::int
    from reco.gift_events e
    where e.kind in ('reserve','purchase','contribute')
      and e.product_id is not null
      -- ONLY training-period events. Using the whole log here would let the
      -- baseline see the future and beat everything.
      and e.occurred_at < p_cutoff
    group by e.product_id
    order by sum(e.weight) desc
    limit p_k;

  elsif p_strategy = 'category_popularity' then
    -- The real bar. The plan is explicit that CF probably will not beat this
    -- at launch, and that pretending otherwise wastes months.
    return query
    with mine as (
      select distinct p.category_id
      from reco.gift_events e
      join public.products p on p.id = e.product_id
      where e.actor_id = p_user and e.occurred_at < p_cutoff
        and p.category_id is not null
    )
    select e.product_id, row_number() over (order by sum(e.weight) desc)::int
    from reco.gift_events e
    join public.products p on p.id = e.product_id
    where e.kind in ('reserve','purchase','contribute')
      and e.occurred_at < p_cutoff
      and (p.category_id in (select category_id from mine)
           or not exists (select 1 from mine))
    group by e.product_id
    order by sum(e.weight) desc
    limit p_k;

  else
    raise exception 'unknown baseline %', p_strategy;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Scoring one strategy
-- ---------------------------------------------------------------------------
create or replace function reco.evaluate(
  p_cutoff timestamptz,
  p_strategy text,
  p_k int default 12
)
returns table (
  recall_at_k numeric,
  map_at_k    numeric,
  ndcg_at_k   numeric,
  coverage    numeric,
  novelty     numeric,
  users_scored bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  with
  -- Users who gave something in the held-out period. Only they can be scored:
  -- a user with no future gifts has no ground truth.
  scorable as (
    select distinct actor_id
    from reco.gift_events
    where kind in ('reserve','purchase','contribute')
      and product_id is not null
      and occurred_at >= p_cutoff
  ),
  truth as (
    select e.actor_id, e.product_id
    from reco.gift_events e
    join scorable s on s.actor_id = e.actor_id
    where e.kind in ('reserve','purchase','contribute')
      and e.product_id is not null
      and e.occurred_at >= p_cutoff
    group by 1, 2
  ),
  slates as (
    select s.actor_id, b.product_id, b.rank
    from scorable s
    cross join lateral reco.baseline_slate(p_strategy, s.actor_id, p_cutoff, p_k) b
  ),
  hits as (
    select sl.actor_id, sl.product_id, sl.rank
    from slates sl
    join truth t on t.actor_id = sl.actor_id and t.product_id = sl.product_id
  ),
  per_user as (
    select s.actor_id,
           (select count(*) from truth t where t.actor_id = s.actor_id) as n_truth,
           (select count(*) from hits h where h.actor_id = s.actor_id) as n_hits,
           -- Average precision: precision at each hit position, averaged.
           coalesce((
             select avg(hp.prec)
             from (
               select (row_number() over (order by h.rank))::numeric / h.rank as prec
               from hits h where h.actor_id = s.actor_id
             ) hp
           ), 0) as ap,
           -- DCG with the usual log2 discount; IDCG assumes every hit could
           -- have been at the top.
           coalesce((
             select sum(1.0 / log(2, h.rank + 1))
             from hits h where h.actor_id = s.actor_id
           ), 0) as dcg,
           coalesce((
             select sum(1.0 / log(2, i + 1))
             from generate_series(1, least(
               (select count(*)::int from truth t where t.actor_id = s.actor_id),
               p_k)) i
           ), 0) as idcg
    from scorable s
  )
  select
    round(avg(case when pu.n_truth > 0
                   then pu.n_hits::numeric / pu.n_truth else 0 end), 4),
    round(avg(pu.ap), 4),
    round(avg(case when pu.idcg > 0 then pu.dcg / pu.idcg else 0 end), 4),
    -- Coverage over the whole active catalogue.
    round((select count(distinct product_id)::numeric from slates)
          / nullif((select count(*) from public.products where status='active'), 0), 4),
    -- Novelty: mean of 1/(1+popularity). Recommending only bestsellers scores
    -- near zero, which is the point.
    round((select coalesce(avg(1.0 / (1 + p.popularity)), 0)
           from slates sl join public.products p on p.id = sl.product_id), 4),
    count(*)
  from per_user pu;
end;
$$;

comment on function reco.evaluate is
  'Offline metrics for one strategy against a temporal holdout. Coverage and novelty are reported alongside recall because a popularity-only system scores well on recall while being useless.';

-- ---------------------------------------------------------------------------
-- A full run
-- ---------------------------------------------------------------------------
create or replace function reco.run_evaluation(
  p_cutoff timestamptz default now() - interval '30 days',
  p_k int default 12
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
  v_strategy text;
  v_train bigint;
  v_test bigint;
begin
  select count(*) filter (where occurred_at <  p_cutoff),
         count(*) filter (where occurred_at >= p_cutoff)
    into v_train, v_test
  from reco.gift_events
  where kind in ('reserve','purchase','contribute') and product_id is not null;

  insert into reco.eval_runs (cutoff, k, train_events, test_events)
  values (p_cutoff, p_k, v_train, v_test)
  returning id into v_run;

  -- Every baseline, every time. Reporting CF's number without the bar it had
  -- to clear is how a tier survives that should not have.
  foreach v_strategy in array array['random','popularity','category_popularity']
  loop
    insert into reco.eval_results
      (run_id, strategy, recall_at_k, map_at_k, ndcg_at_k, coverage, novelty, users_scored)
    select v_run, v_strategy, e.recall_at_k, e.map_at_k, e.ndcg_at_k,
           e.coverage, e.novelty, e.users_scored
    from reco.evaluate(p_cutoff, v_strategy, p_k) e;
  end loop;

  return v_run;
end;
$$;

-- ---------------------------------------------------------------------------
-- The verdict
-- ---------------------------------------------------------------------------
--
-- Answers the only question that matters: did the complicated thing beat the
-- simple thing? Returns the comparison rather than a boolean, because "by how
-- much" decides whether the extra machinery is worth maintaining.
create or replace function reco.evaluation_verdict(p_run uuid)
returns table (
  strategy    text,
  recall_at_k numeric,
  vs_category numeric,
  coverage    numeric,
  verdict     text
)
language sql
stable
security definer
set search_path = ''
as $$
  with baseline as (
    select recall_at_k as bar
    from reco.eval_results
    where run_id = p_run and strategy = 'category_popularity'
  )
  select r.strategy,
         r.recall_at_k,
         round(r.recall_at_k - b.bar, 4),
         r.coverage,
         case
           when r.strategy = 'category_popularity' then 'the bar'
           when r.recall_at_k > b.bar then 'beats the bar'
           else 'does NOT beat the bar — ship the measurement, not the tier'
         end
  from reco.eval_results r
  cross join baseline b
  where r.run_id = p_run
  order by r.recall_at_k desc;
$$;

comment on function reco.evaluation_verdict is
  'Every strategy against category_popularity. A tier that does not beat the bar should be deleted from the cascade, not retuned until the numbers agree.';

revoke all on all tables in schema reco from anon, authenticated;
revoke all on all functions in schema reco from anon, authenticated;
