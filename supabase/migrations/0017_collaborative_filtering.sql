-- 0017_collaborative_filtering.sql
--
-- Item-item collaborative filtering over the giver x product matrix.
--
-- WHY ITEM-ITEM, AND NOT MATRIX FACTORISATION
--
-- The matrix is implicit, and at launch it is nearly empty: a realistic early
-- user has given between zero and three gifts. That rules out ALS and BPR,
-- which need hundreds of interactions per latent dimension before they beat a
-- popularity baseline, and which produce embeddings nobody can explain when
-- the results are wrong. It also rules out user-user CF: users are both the
-- sparse axis and the volatile one, so neighbourhoods would be noise.
--
-- Items accumulate signal across everyone, item-item similarity is stable over
-- days, it precomputes into a small table, and every recommendation carries a
-- one-line explanation — "because you gave the Chemex". That explainability is
-- what makes a cold system debuggable at all.
--
-- THIS TIER IS GATED. reco.cf_is_ready() answers whether there is enough
-- signal, and the cascade skips CF when there is not. The plan's instruction
-- is explicit and worth repeating here: if CF does not beat category
-- popularity on held-out recall, the measurement ships and the tier does not.

-- ---------------------------------------------------------------------------
-- The matrix
-- ---------------------------------------------------------------------------
--
-- Confidence is log-damped: someone who reserved the same product four times
-- is not four times the evidence, and without the damping a single heavy user
-- dominates every similarity they touch.
create materialized view reco.giver_product as
select e.actor_id as giver_id,
       coalesce(p.merged_into, e.product_id) as product_id,
       ln(1 + sum(e.weight))::real as confidence
from reco.gift_events e
join public.products p on p.id = e.product_id
where e.kind in ('reserve', 'purchase', 'contribute')
  and e.product_id is not null
  and e.weight > 0
  -- Two years: older giving says little about what someone would choose now,
  -- and keeping it makes the self-join grow without improving anything.
  and e.occurred_at > now() - interval '24 months'
group by 1, 2;

-- Required for REFRESH MATERIALIZED VIEW CONCURRENTLY, which is what keeps
-- the nightly refresh from locking reads.
create unique index giver_product_pk
  on reco.giver_product (giver_id, product_id);

comment on materialized view reco.giver_product is
  'The giver x product matrix. Products resolve through merged_into so a deduplicated pair contributes to one row, not two.';

-- ---------------------------------------------------------------------------
-- Item-item similarity
-- ---------------------------------------------------------------------------
--
-- THE SHRINKAGE IS THE WHOLE THING AT LOW VOLUME.
--
-- Cosine alone gives similarity 1.0 to any pair of products that exactly one
-- person happened to buy together — which, in a sparse system, is most pairs.
-- The top of every recommendation list would be coincidences with support 1,
-- and it would look like a broken model rather than a data problem.
--
-- support/(support+lambda) pulls low-support pairs toward zero. With
-- lambda = 10, a pair seen 3 times keeps 23% of its cosine and a pair seen 50
-- times keeps 83%. Combined with a minimum support of 3, this is the
-- difference between a demo that looks smart and one that looks broken.
create materialized view reco.item_similarity as
with norms as (
  select product_id, sqrt(sum(confidence * confidence)) as norm
  from reco.giver_product
  group by 1
),
pairs as (
  select a.product_id as x,
         b.product_id as y,
         sum(a.confidence * b.confidence) as dot,
         count(*)::int as support
  from reco.giver_product a
  join reco.giver_product b
    on a.giver_id = b.giver_id
   -- Ordered pair, so each unordered pair is computed once. Lookups query
   -- both directions via the two indexes below.
   and a.product_id < b.product_id
  group by 1, 2
  -- Minimum support. Below three co-occurrences it is coincidence, and no
  -- amount of shrinkage makes a coincidence informative.
  having count(*) >= 3
)
select p.x,
       p.y,
       ((p.dot / (nx.norm * ny.norm)) *
        (p.support::real / (p.support + 10)))::real as similarity,
       p.support
from pairs p
join norms nx on nx.product_id = p.x
join norms ny on ny.product_id = p.y;

create unique index item_similarity_pk on reco.item_similarity (x, y);
create index item_similarity_x on reco.item_similarity (x, similarity desc);
create index item_similarity_y on reco.item_similarity (y, similarity desc);

comment on materialized view reco.item_similarity is
  'Cosine similarity shrunk by support/(support+10), minimum support 3. Without the shrinkage every top recommendation in a sparse system is a support-1 coincidence.';

-- ---------------------------------------------------------------------------
-- The gate
-- ---------------------------------------------------------------------------
--
-- CF that fires on too little data is worse than no CF: it produces confident
-- nonsense, and confident nonsense is harder to notice than an empty tier.
create or replace function reco.cf_is_ready(p_min_events int default 5000)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) >= p_min_events
  from reco.gift_events
  where kind in ('reserve', 'purchase', 'contribute')
    and product_id is not null;
$$;

comment on function reco.cf_is_ready is
  'Whether there is enough giving signal for CF to beat a popularity baseline. The threshold is a guess; the evaluation harness is what settles it.';

-- ---------------------------------------------------------------------------
-- Candidates
-- ---------------------------------------------------------------------------
create or replace function reco.cf_candidates(
  p_viewer uuid,
  p_recipient uuid,
  p_limit int default 24
)
returns table (
  out_product_id uuid,
  out_score real,
  out_because_product_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not reco.cf_is_ready() then
    -- Not enough signal. Returning nothing lets the cascade fall through to
    -- the content tiers, which is the correct behaviour and the honest one.
    return;
  end if;

  return query
  with seeds as (
    -- What the VIEWER has given. CF here answers "people who gave what you
    -- gave also gave...", so the seed set is the viewer's history, not the
    -- recipient's.
    select gp.product_id, gp.confidence
    from reco.giver_product gp
    where gp.giver_id = p_viewer
    order by gp.confidence desc
    -- Cap the basket: one prolific giver should not turn this into a scan of
    -- the whole similarity table.
    limit 200
  ),
  scored as (
    select sim.other as product_id,
           sum(sim.similarity * s.confidence)::real as score,
           -- The seed that contributed most, for the explanation.
           (array_agg(s.product_id order by sim.similarity * s.confidence desc))[1]
             as because_product_id
    from seeds s
    join lateral (
      select y as other, similarity from reco.item_similarity where x = s.product_id
      union all
      select x as other, similarity from reco.item_similarity where y = s.product_id
    ) sim on true
    group by sim.other
  )
  select sc.product_id, sc.score, sc.because_product_id
  from scored sc
  join public.products p on p.id = sc.product_id and p.status = 'active'
  where sc.product_id not in (select product_id from seeds)
    -- Already asked for: not a recommendation.
    and sc.product_id not in (
      select wi.product_id from public.wish_items wi
      where wi.owner_id = p_recipient and wi.product_id is not null
        and wi.status = 'active'
    )
    -- The VIEWER's own holds only.
    --
    -- Excluding anyone else's would make the slate encode reservation state,
    -- which is the covert channel documented at length in 0013. The invariance
    -- test asserts this tier obeys it too.
    and sc.product_id not in (
      select wi.product_id
      from private.reservations r
      join public.wish_items wi on wi.id = r.wish_item_id
      where r.reserver_id = p_viewer and r.state in ('held', 'purchased')
        and wi.product_id is not null
    )
  order by sc.score desc
  limit p_limit;
end;
$$;

comment on function reco.cf_candidates is
  '"People who gave what you gave also gave...". Seeded from the VIEWER''s history; filters only the viewer''s own reservations.';

-- ---------------------------------------------------------------------------
-- Refresh
-- ---------------------------------------------------------------------------
create or replace function reco.refresh_cf()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- CONCURRENTLY so a nightly refresh does not lock out reads. It needs the
  -- unique indexes declared above.
  refresh materialized view concurrently reco.giver_product;
  refresh materialized view concurrently reco.item_similarity;
  perform reco.refresh_popularity();
end;
$$;

comment on function reco.refresh_cf is
  'Nightly rebuild. Precomputed rather than on-demand: serving must be one indexed select, not a self-join.';

revoke all on all tables in schema reco from anon, authenticated;
revoke all on all functions in schema reco from anon, authenticated;
