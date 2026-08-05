-- 0013_recommendations.sql
--
-- The recommendation cascade: content-based and popularity tiers.
--
-- NOT a placeholder for collaborative filtering. CF is gated on roughly 5 000
-- giving events, which is months away, and a well-tuned content-based
-- recommender with an explicit cascade and a diversity pass is a good product
-- in its own right. CF gets added when the data justifies it AND it beats
-- these tiers on held-out recall — if it does not, the measurement ships and
-- the tier does not.
--
-- Every row carries the strategy that produced it. That is what makes the
-- system debuggable ("why is this here?") and evaluable (per-tier CTR), and it
-- is the reason the tiers can be compared at all.

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
create table reco.recommendations (
  id            bigint generated always as identity primary key,

  -- Who is being advised.
  viewer_id     uuid not null references public.profiles (id) on delete cascade,

  -- Who the gift is for. Null means "ideas for you to give, in general".
  recipient_id  uuid references public.profiles (id) on delete cascade,

  product_id    uuid not null references public.products (id) on delete cascade,

  score         real not null,
  strategy      public.reco_strategy not null,

  -- Explainability. Which of the viewer's past gifts, or which signal, put this
  -- here — so a slate can answer "why" without re-running the pipeline.
  because_product_id uuid references public.products (id) on delete set null,

  rank          smallint not null,
  batch_id      uuid not null,
  generated_at  timestamptz not null default now(),

  -- A viewer is never advised about themselves. This is not a tidiness rule:
  -- see the covert-channel argument on rebuild_recommendations below.
  constraint no_self_reco check (recipient_id is null or viewer_id <> recipient_id),

  unique (viewer_id, recipient_id, product_id, batch_id)
);

create index recos_serve
  on reco.recommendations (viewer_id, recipient_id, rank);

comment on table reco.recommendations is
  'Precomputed slates. In `reco` so nobody can query another viewer''s slate and diff it — see the leak note on rebuild_recommendations.';
comment on column reco.recommendations.strategy is
  'The tier that produced this row. Without it, per-tier CTR is unmeasurable and "why is this here" is unanswerable.';

-- Impressions, so each tier's conversion is measurable rather than assumed.
create table reco.reco_impressions (
  reco_id      bigint not null references reco.recommendations (id) on delete cascade,
  shown_at     timestamptz not null default now(),
  clicked_at   timestamptz,
  converted_at timestamptz,
  primary key (reco_id, shown_at)
);

alter table reco.recommendations   enable row level security;
alter table reco.recommendations   force  row level security;
alter table reco.reco_impressions  enable row level security;
alter table reco.reco_impressions  force  row level security;

-- ---------------------------------------------------------------------------
-- Popularity, refreshed from the event log
-- ---------------------------------------------------------------------------
--
-- Weighted by the confidences in reco.event_weights, so a product ten people
-- bought outranks one forty people glanced at. Time-decayed over 12 months:
-- last year's bestseller is not this year's.
create or replace function reco.refresh_popularity()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.products p
  set popularity = coalesce(s.score, 0)
  from (
    select e.product_id,
           round(sum(
             e.weight * exp(
               -extract(epoch from (now() - e.occurred_at)) / (86400 * 180)
             )
           ))::integer as score
    from reco.gift_events e
    where e.product_id is not null
      and e.occurred_at > now() - interval '12 months'
    group by e.product_id
  ) s
  where p.id = s.product_id;
$$;

comment on function reco.refresh_popularity is
  'Weighted, time-decayed popularity. A raw count would let a product that once trended outrank one selling today.';

-- ---------------------------------------------------------------------------
-- The cascade
-- ---------------------------------------------------------------------------
--
-- THE LEAK THIS FUNCTION MUST NOT REOPEN
--
-- The obvious improvement is to filter out items other friends have already
-- reserved for the recipient. Do not. The slate would then encode reservation
-- state, and an owner with a second account could diff their own slate over
-- time and read the reservation table by inference — through a feature with no
-- apparent connection to reservations at all.
--
-- Three rules hold the line:
--   1. viewer_id <> recipient_id, enforced by a constraint above. A viewer is
--      never advised about themselves, so there is no self-oracle.
--   2. Only the VIEWER's own reservations are excluded. They already know what
--      they reserved; excluding it tells them nothing new. Other people's
--      reservations are NOT excluded, which means a viewer may be recommended
--      something already taken. That is an accepted product cost — the
--      alternative is a covert channel — and it is handled at the interaction
--      layer instead: the reserve flow says "déjà réservé par un proche",
--      which is friend-to-friend disclosure the model already permits.
--   3. No input derives from reservations on the recipient's own list. Taste
--      comes from their WISHES and INTERESTS, both of which they know about
--      themselves.
--
-- The invariance test in supabase/tests/0004_reco.test.sql asserts rule 3
-- directly, because it is the one a well-meaning future edit breaks.
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

  -- The recipient's typical price band, from their own wishes. Recommending a
  -- 900 € gift to someone whose list tops out at 40 € is technically on-taste
  -- and practically useless.
  select public.price_band(percentile_cont(0.5) within group (
           order by wi.price_cents)::integer)
    into v_band
  from public.wish_items wi
  where wi.owner_id = p_recipient and wi.status = 'active'
    and wi.price_cents is not null;

  with
  -- Everything already on the recipient's list. Recommending what they have
  -- asked for is not a recommendation.
  already_wished as (
    -- ACTIVE wishes only. Without the status filter an archived or fulfilled
    -- wish blocks its product forever: someone who received a thing last
    -- Christmas could never be recommended it again, for anyone, and the
    -- exclusion would be invisible because it looks like the product simply
    -- did not rank.
    select product_id from public.wish_items
    where owner_id = p_recipient and product_id is not null
      and status = 'active'
  ),
  -- Only the VIEWER's own holds. Rule 2 above.
  mine_already as (
    select r.wish_item_id, wi.product_id
    from private.reservations r
    join public.wish_items wi on wi.id = r.wish_item_id
    where r.reserver_id = p_viewer and r.state in ('held', 'purchased')
      and wi.product_id is not null
  ),
  -- The recipient's declared interests, as tag ids.
  taste as (
    select t.id as tag_id
    from public.profiles pr
    cross join lateral unnest(pr.interests) as i(label)
    join public.tags t on t.slug = public.title_key(i.label)
                       or lower(t.label_fr) = lower(i.label)
    where pr.id = p_recipient
  ),
  candidates as (
    select p.id as product_id,
           -- Tier 3: content, matched on the recipient's declared taste.
           case when exists (
                  select 1 from public.product_tags pt
                  join taste on taste.tag_id = pt.tag_id
                  where pt.product_id = p.id)
                then 'content_facet'::public.reco_strategy
                else 'popularity'::public.reco_strategy
           end as strategy,
           -- Popularity carries the ranking inside each tier; the price-band
           -- match is a bonus rather than a filter, so a slate is never empty
           -- for want of a perfectly-priced product.
           p.popularity
             + case when p.price_band = v_band then 25 else 0 end
             + case when exists (
                 select 1 from public.product_tags pt
                 join taste on taste.tag_id = pt.tag_id
                 where pt.product_id = p.id) then 100 else 0 end
             as score,
           p.category_id,
           p.merchant_id
    from public.products p
    where p.status = 'active'
      and p.id not in (select product_id from already_wished)
      and p.id not in (select product_id from mine_already)
  ),
  -- Diversity: at most two per category and two per merchant. Without this the
  -- top of a slate is five variants of the same headphones, and the feature
  -- looks stupid however good the scoring is.
  diversified as (
    select *,
           row_number() over (partition by category_id order by score desc) as cat_rank,
           row_number() over (partition by merchant_id order by score desc) as merch_rank
    from candidates
  ),
  final as (
    select product_id, strategy, score,
           row_number() over (order by score desc, product_id) as rank
    from diversified
    where cat_rank <= 2 and merch_rank <= 2
    order by score desc
    limit p_limit
  )
  insert into reco.recommendations
    (viewer_id, recipient_id, product_id, score, strategy, rank, batch_id)
  select p_viewer, p_recipient, product_id, score, strategy, rank, v_batch
  from final;

  return v_batch;
end;
$$;

-- ---------------------------------------------------------------------------
-- Serving
-- ---------------------------------------------------------------------------
create or replace function public.get_recommendations(
  p_recipient uuid,
  p_limit int default 12
)
returns table (
  product_id  uuid,
  title       text,
  image_url   text,
  price_cents integer,
  currency    char(3),
  merchant    text,
  strategy    public.reco_strategy,
  because     text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_batch uuid;
begin
  if v_uid is null then
    raise exception 'not found' using errcode = '42704';
  end if;

  -- Rule 1. Asking for recommendations about yourself is the direct form of
  -- the oracle, so it is refused outright rather than returning nothing.
  if v_uid = p_recipient then
    raise exception 'not found' using errcode = '42704';
  end if;

  -- You can only be advised about someone whose list you could see anyway.
  if not public.is_friend(v_uid, p_recipient) then
    raise exception 'not found' using errcode = '42704';
  end if;

  select r.batch_id into v_batch
  from reco.recommendations r
  where r.viewer_id = v_uid and r.recipient_id = p_recipient
  order by r.generated_at desc
  limit 1;

  -- No slate yet: build one on demand. A first-time viewer seeing an empty
  -- screen would conclude the feature is broken.
  if v_batch is null then
    v_batch := reco.rebuild_recommendations(v_uid, p_recipient, p_limit);
  end if;

  return query
  select p.id, p.title, p.image_url, p.price_cents, p.currency,
         m.name, r.strategy, bp.title
  from reco.recommendations r
  join public.products p on p.id = r.product_id
  left join public.merchants m on m.id = p.merchant_id
  left join public.products bp on bp.id = r.because_product_id
  where r.viewer_id = v_uid
    and r.recipient_id = p_recipient
    and r.batch_id = v_batch
  order by r.rank
  limit p_limit;
end;
$$;

comment on function public.get_recommendations is
  'A slate for a friend. Refuses a viewer asking about themselves: that is the direct form of the reservation oracle.';

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on all tables in schema reco from anon, authenticated;
revoke all on all functions in schema reco from anon, authenticated;

revoke all on function public.get_recommendations(uuid, int) from public;
grant execute on function public.get_recommendations(uuid, int) to authenticated;
