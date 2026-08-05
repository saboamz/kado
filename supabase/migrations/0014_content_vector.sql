-- 0014_content_vector.sql
--
-- The content_vector tier: nearest neighbours to a taste vector built from
-- what the recipient has actually asked for.
--
-- Slots ABOVE content_facet in the cascade and below CF. Facet matching can
-- only fire when someone has declared interests and a product carries a
-- matching tag; the vector tier works from the wishes themselves, which
-- everyone has, and catches similarity no tag was ever written for — a Chemex
-- and a Moka pot share no tag and are obviously alike.

-- HNSW rather than IVFFlat: IVFFlat needs training on a populated table and
-- degrades badly when the catalogue grows past what it was trained on, which
-- is exactly the regime a launching product lives in.
create index if not exists products_embedding_hnsw
  on public.products
  using hnsw (embedding extensions.vector_cosine_ops)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- The recipient's taste vector
-- ---------------------------------------------------------------------------
--
-- The mean of the embeddings of what they have asked for. Deliberately built
-- from WISHES, never from what has been reserved for them: rule 3 of the leak
-- argument in 0013. Their own list is something they already know about
-- themselves, so nothing derived from it can tell them anything new.
create or replace function reco.taste_vector(p_person uuid)
returns extensions.vector
language sql
stable
security definer
set search_path = 'extensions'
as $$
  -- pgvector's avg() is the centroid. Qualified with the schema because
  -- `set search_path = ''` hides it otherwise — an unqualified call fails at
  -- creation time with "function avg(vector) does not exist", which reads as
  -- a missing extension rather than a resolution problem.
  select avg(p.embedding)::extensions.vector
  from public.wish_items wi
  join public.products p on p.id = wi.product_id
  where wi.owner_id = p_person
    and wi.status = 'active'
    and p.embedding is not null;
$$;

comment on function reco.taste_vector is
  'Centroid of what a person has asked for. Built from wishes only — never from reservations, which is rule 3 of the covert-channel argument.';

-- ---------------------------------------------------------------------------
-- The tier
-- ---------------------------------------------------------------------------
--
-- Returns candidates rather than writing rows, so rebuild_recommendations
-- stays the single place that decides what a slate contains.
-- Dropped first: the OUT-parameter row type changed, and CREATE OR REPLACE
-- cannot alter that.
drop function if exists reco.vector_candidates(uuid, uuid, int);

create or replace function reco.vector_candidates(
  p_viewer uuid,
  p_recipient uuid,
  p_limit int default 24
)
returns table (out_product_id uuid, out_score real, out_because_product_id uuid)
language plpgsql
stable
security definer
-- `extensions` rather than '' : the cosine operator `<=>` cannot be
-- schema-qualified inline, so it must be resolvable by name. Everything else
-- in the body stays fully qualified, so widening the path by one schema of
-- operators does not widen what this function can be tricked into calling.
set search_path = 'extensions'
as $$
declare
  v_taste extensions.vector;
  v_model text;
begin
  v_taste := reco.taste_vector(p_recipient);
  if v_taste is null then
    -- No embedded wishes yet: this tier simply does not fire, and the cascade
    -- falls through to facet and popularity. Returning nothing is correct;
    -- returning arbitrary products would look like a working tier.
    return;
  end if;

  -- Compare only against vectors from the SAME model. Mixing embedding spaces
  -- does not error, it just returns confident nonsense.
  select embedding_model into v_model
  from public.products
  where embedding is not null
  group by embedding_model
  order by count(*) desc
  limit 1;

  return query
  select p.id,
         -- Cosine distance is 0..2; turn it into a score where higher is
         -- better and scale it into the same range as the popularity tier so
         -- the two can be ordered against each other at all.
         ((1 - (p.embedding <=> v_taste)) * 200)::real,
         -- The nearest thing they already want, so the slate can say why.
         (select wi.product_id
          from public.wish_items wi
          join public.products wp on wp.id = wi.product_id
          where wi.owner_id = p_recipient and wi.status = 'active'
            and wp.embedding is not null
            and wp.embedding_model = v_model
          order by wp.embedding <=> p.embedding
          limit 1)
  from public.products p
  where p.status = 'active'
    and p.embedding is not null
    and p.embedding_model = v_model
    -- Already asked for: recommending it is not a recommendation.
    and p.id not in (
      select product_id from public.wish_items
      where owner_id = p_recipient and product_id is not null
        and status = 'active'
    )
    -- The viewer's OWN holds only. Rule 2.
    and p.id not in (
      select wi.product_id
      from private.reservations r
      join public.wish_items wi on wi.id = r.wish_item_id
      where r.reserver_id = p_viewer and r.state in ('held', 'purchased')
        and wi.product_id is not null
    )
  order by p.embedding <=> v_taste
  limit p_limit;
end;
$$;

comment on function reco.vector_candidates is
  'Nearest neighbours to the recipient''s taste. Filters only the viewer''s own reservations — excluding anyone else''s would encode reservation state into the slate.';

-- ---------------------------------------------------------------------------
-- Folding it into the cascade
-- ---------------------------------------------------------------------------
create or replace function reco.rebuild_recommendations(
  p_viewer uuid,
  p_recipient uuid,
  p_limit int default 12
)
returns uuid
language plpgsql
security definer
set search_path = ''
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
  -- Tier 2. Empty when nothing is embedded yet, which is the launch state.
  vectors as (
    select out_product_id as product_id,
           out_score as score,
           out_because_product_id as because_product_id
    from reco.vector_candidates(p_viewer, p_recipient, p_limit * 2)
  ),
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
  -- The cascade proper: a product's tier is the highest one that claims it.
  -- A vector match outranks a facet match outranks bare popularity, and the
  -- recorded strategy is what makes per-tier CTR comparable later.
  merged as (
    select coalesce(v.product_id, f.product_id) as product_id,
           case when v.product_id is not null
                then 'content_vector'::public.reco_strategy
                else f.strategy end as strategy,
           coalesce(v.score, f.score) as score,
           v.because_product_id
    from facets f
    full outer join vectors v on v.product_id = f.product_id
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
