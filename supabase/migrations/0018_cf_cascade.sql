-- 0018_cf_cascade.sql
--
-- CF takes its place at the top of the cascade: cf_item, then content_vector,
-- then content_facet, then popularity.
--
-- The ordering is a claim about signal quality, not a preference. "People who
-- gave what you gave also gave this" is stronger evidence than "this resembles
-- what they asked for", which is stronger than "they said they like ceramics",
-- which is stronger than "it sells well". Whether that claim survives contact
-- with data is what the evaluation harness measures — and if cf_item does not
-- beat the tier below it, the honest response is to remove it from this
-- function, not to retune until the numbers agree.

create or replace function reco.rebuild_recommendations(
  p_viewer uuid,
  p_recipient uuid,
  p_limit int default 12
)
returns uuid
language plpgsql
security definer
set search_path = 'extensions'
as $$
declare
  v_batch uuid := gen_random_uuid();
  v_band  smallint;
begin
  if p_viewer = p_recipient then
    raise exception 'a viewer is never advised about themselves'
      using errcode = '22023';
  end if;

  select public.price_band(percentile_cont(0.5) within group (
           order by wi.price_cents)::integer)
    into v_band
  from public.wish_items wi
  where wi.owner_id = p_recipient and wi.status = 'active'
    and wi.price_cents is not null;

  with
  already_wished as (
    select product_id from public.wish_items
    where owner_id = p_recipient and product_id is not null
      and status = 'active'
  ),
  mine_already as (
    select wi.product_id
    from private.reservations r
    join public.wish_items wi on wi.id = r.wish_item_id
    where r.reserver_id = p_viewer and r.state in ('held', 'purchased')
      and wi.product_id is not null
  ),
  taste as (
    select t.id as tag_id
    from public.profiles pr
    cross join lateral unnest(pr.interests) as i(label)
    join public.tags t on t.slug = public.title_key(i.label)
                       or lower(t.label_fr) = lower(i.label)
    where pr.id = p_recipient
  ),
  -- Tier 1. Empty until cf_is_ready(), which is the launch state.
  cf as (
    select out_product_id as product_id,
           out_score as score,
           out_because_product_id as because_product_id
    from reco.cf_candidates(p_viewer, p_recipient, p_limit * 2)
  ),
  -- Tier 2.
  vectors as (
    select out_product_id as product_id,
           out_score as score,
           out_because_product_id as because_product_id
    from reco.vector_candidates(p_viewer, p_recipient, p_limit * 2)
  ),
  -- Tiers 3 and 4.
  facets as (
    select p.id as product_id,
           (p.popularity
             + case when p.price_band = v_band then 25 else 0 end
             + case when exists (
                 select 1 from public.product_tags pt
                 join taste on taste.tag_id = pt.tag_id
                 where pt.product_id = p.id) then 100 else 0 end)::real as score,
           case when exists (
                  select 1 from public.product_tags pt
                  join taste on taste.tag_id = pt.tag_id
                  where pt.product_id = p.id)
                then 'content_facet'::public.reco_strategy
                else 'popularity'::public.reco_strategy
           end as strategy
    from public.products p
    where p.status = 'active'
      and p.id not in (select product_id from already_wished)
      and p.id not in (select product_id from mine_already)
  ),
  -- A product's tier is the highest one that claims it. Recording which is
  -- what makes the tiers comparable, and therefore what makes it possible to
  -- discover that one of them is not earning its place.
  merged as (
    select coalesce(c.product_id, v.product_id, f.product_id) as product_id,
           case when c.product_id is not null then 'cf_item'::public.reco_strategy
                when v.product_id is not null then 'content_vector'::public.reco_strategy
                else f.strategy end as strategy,
           -- CF scores are on their own scale; lift them clear of the content
           -- tiers so ordering follows the cascade rather than accidental
           -- magnitudes.
           coalesce(c.score * 1000, v.score, f.score) as score,
           coalesce(c.because_product_id, v.because_product_id) as because_product_id
    from facets f
    full outer join vectors v on v.product_id = f.product_id
    full outer join cf c on c.product_id = coalesce(v.product_id, f.product_id)
  ),
  enriched as (
    select m.*, p.category_id, p.merchant_id
    from merged m
    join public.products p on p.id = m.product_id
  ),
  diversified as (
    select *,
           row_number() over (partition by category_id order by score desc) as cat_rank,
           row_number() over (partition by merchant_id order by score desc) as merch_rank
    from enriched
  ),
  final as (
    select product_id, strategy, score, because_product_id,
           row_number() over (order by score desc, product_id) as rank
    from diversified
    where cat_rank <= 2 and merch_rank <= 2
    order by score desc
    limit p_limit
  )
  insert into reco.recommendations
    (viewer_id, recipient_id, product_id, score, strategy, rank, batch_id,
     because_product_id)
  select p_viewer, p_recipient, product_id, score, strategy, rank, v_batch,
         because_product_id
  from final;

  return v_batch;
end;
$$;

-- ---------------------------------------------------------------------------
-- Health: is CF actually contributing?
-- ---------------------------------------------------------------------------
--
-- The signal to watch. The plan's warning, restated where it will be seen: if
-- the cf_item share does not rise as data accumulates, DEDUPLICATION is broken
-- before the model is — the signal is split across duplicate product rows and
-- no pair reaches the support threshold.
create or replace function reco.tier_mix()
returns table (strategy public.reco_strategy, slates bigint, share numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select r.strategy,
         count(*) as slates,
         round(100.0 * count(*) / nullif(sum(count(*)) over (), 0), 1) as share
  from reco.recommendations r
  group by r.strategy
  order by count(*) desc;
$$;

comment on function reco.tier_mix is
  'Per-tier share of served slots. A cf_item share that will not rise means deduplication is broken, not that the model needs tuning.';
