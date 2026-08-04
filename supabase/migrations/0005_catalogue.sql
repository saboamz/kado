-- 0005_catalogue.sql
--
-- The shared product catalogue. One row per real-world product, referenced by
-- many people's wishes.
--
-- Why a catalogue at all, rather than copying title/price onto each wish: the
-- recommender needs "who else wanted this exact thing", price refresh needs one
-- place to write, and a collaborative pot needs a price that does not drift
-- between the organiser's copy and the contributors'. Deduplication is
-- therefore not a nicety — it is the feature.

-- Note on gen_random_uuid(): it is unqualified on purpose. Since Postgres 13 it
-- is a core function in pg_catalog, which is always on the search_path and
-- cannot be shadowed by a user schema. The pgcrypto-provided
-- extensions.gen_random_uuid() no longer exists on PG13+, so qualifying it the
-- way we qualify digest()/unaccent() would fail at DDL time.

-- ---------------------------------------------------------------------------
-- merchants
-- ---------------------------------------------------------------------------
create table public.merchants (
  id                uuid primary key default gen_random_uuid(),
  slug              extensions.citext not null unique check (slug ~ '^[a-z0-9-]{2,48}$'),
  name              text not null,

  -- All hostnames this merchant serves from, normalised (no scheme, no www).
  -- Array rather than a child table because it is a small, read-mostly lookup
  -- consulted on every ingest to resolve a URL to a merchant.
  domains           extensions.citext[] not null default '{}',
  logo_url          text,

  -- Which affiliate network to route click-outs through, if any. Null means we
  -- link direct and earn nothing.
  affiliate_program text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.merchants is
  'Retailers we can resolve a URL to. Drives click-out attribution and merchant-scoped title dedup.';
comment on column public.merchants.domains is
  'Normalised hostnames (no scheme, no www) to match against normalize_url output during ingest.';

-- GIN on the array so "which merchant owns this hostname" is an index lookup
-- with the && / @> operators rather than a seq scan unnesting every row.
create index merchants_domains_gin_idx
  on public.merchants using gin (domains);

create trigger merchants_touch_updated_at
  before update on public.merchants
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
-- Shallow tree ('Tech', 'Maison', 'Voyage', 'Sport'). Self-referencing rather
-- than a fixed two-level schema so we can deepen it later without a migration
-- on every consumer.
create table public.categories (
  id        uuid primary key default gen_random_uuid(),
  slug      extensions.citext not null unique check (slug ~ '^[a-z0-9-]{2,48}$'),

  -- Label is French-only for now. When a second locale arrives this becomes a
  -- categories_i18n child table; naming the column label_fr rather than `label`
  -- makes that migration obvious instead of ambiguous.
  label_fr  text not null,

  parent_id uuid references public.categories (id) on delete set null,

  -- Manual display order. The UI shows categories in a deliberate order
  -- (popularity, not alphabetical), so this cannot be derived.
  sort      integer not null default 0
);

comment on table public.categories is
  'Shallow category tree. Self-referencing so depth can grow without a schema change.';
comment on column public.categories.label_fr is
  'Explicitly _fr: the rename to a categories_i18n table should be forced, not silently skipped, when a second locale lands.';

create index categories_parent_sort_idx on public.categories (parent_id, sort);

-- ---------------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------------
-- Cross-cutting facets ('Céramique', 'Café', 'Randonnée', 'Design'). Orthogonal
-- to categories: a category answers "what is it", a tag answers "who is it
-- for". These are matched against profiles.interests by the recommender.
create table public.tags (
  id       uuid primary key default gen_random_uuid(),
  slug     extensions.citext not null unique check (slug ~ '^[a-z0-9-]{2,48}$'),
  label_fr text not null
);

comment on table public.tags is
  'Interest facets, orthogonal to categories. Category = what it is; tag = who it suits. Matched against profiles.interests.';

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
create table public.products (
  id                  uuid primary key default gen_random_uuid(),
  merchant_id         uuid references public.merchants (id) on delete set null,

  title               text not null check (char_length(title) between 1 and 200),
  brand               text,
  description         text,
  image_url           text,

  -- The URL as we received it, kept verbatim for click-out and for debugging a
  -- bad normalisation. Never used as an identity key — url_norm is.
  source_url          text,

  -- Identity axis 1. Generated so it can never drift from source_url: a
  -- trigger-maintained column would silently go stale on any UPDATE that
  -- forgot to fire it, and a stale identity key merges two different products.
  url_norm            text
                      generated always as (public.normalize_url(source_url)) stored,

  -- Hash of url_norm rather than a unique index on url_norm itself. Product
  -- URLs run long (deep paths, retained filter params) and btree keys are
  -- capped at ~2704 bytes; a sufficiently long URL would fail to insert at all.
  -- A fixed 32-byte digest indexes uniformly and keeps the index small enough
  -- to stay cached.
  url_hash            bytea
                      generated always as (
                        case
                          when public.normalize_url(source_url) is null then null
                          else extensions.digest(public.normalize_url(source_url), 'sha256')
                        end
                      ) stored,

  -- Identity axis 2, for merchants whose URLs are unstable.
  merchant_title_key  text generated always as (public.title_key(title)) stored,

  -- Identity axis 3: the barcode. Strongest signal when present, which is
  -- rarely — most merchant pages do not publish it.
  gtin                text check (gtin is null or gtin ~ '^[0-9]{8,14}$'),

  -- Money: integer cents + ISO code. Never float (0.1 + 0.2 problems on a pot
  -- total), never a formatted string (unparseable, locale-dependent).
  price_cents         integer check (price_cents is null or price_cents >= 0),
  currency            char(3) not null default 'EUR',

  -- Null means "never checked". Distinct from an old timestamp, which means
  -- "checked, now stale". The refresh cron orders by this nulls-first.
  price_checked_at    timestamptz,

  category_id         uuid references public.categories (id) on delete set null,

  -- Generated, not stored-by-the-writer: a facet that disagrees with the price
  -- it is derived from produces search results that are simply wrong, and every
  -- ingestion path would otherwise have to remember to recompute it.
  price_band          smallint generated always as (public.price_band(price_cents)) stored,

  -- 384 dims = all-MiniLM-L6-v2 / multilingual-e5-small class models. Small
  -- enough that an HNSW index over the whole catalogue stays in memory; the
  -- model name is stored alongside so a model swap is detectable rather than
  -- producing silently meaningless cosine distances between vectors from two
  -- different embedding spaces.
  embedding           extensions.vector(384),
  embedding_model     text,

  -- active: sellable. stale: not re-verified recently. dead: 404/discontinued.
  -- merged: superseded by another row, kept so existing wish_items keep
  -- resolving instead of breaking their foreign key.
  status              text not null default 'active'
                      check (status in ('active', 'stale', 'dead', 'merged')),
  merged_into         uuid references public.products (id) on delete set null,

  -- Denormalised counter maintained by the reco pipeline. Safe to denormalise
  -- HERE precisely because it is public catalogue data — contrast wish_items,
  -- where a counter would be a secrecy leak (see 0006).
  popularity          integer not null default 0,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- A merged row without a target is a dangling pointer: readers follow
  -- merged_into to find the survivor and would get null instead.
  constraint merged_has_target
    check (status <> 'merged' or merged_into is not null)
);

comment on table public.products is
  'Canonical catalogue, deduplicated on three axes (url_hash, merchant+title, gtin). One row per real-world product so reco signal and price refresh are not split across duplicates.';
comment on column public.products.source_url is
  'Verbatim as received, for click-out and debugging. Identity comes from url_norm, never from this.';
comment on column public.products.url_hash is
  'sha256(url_norm). Hashed because btree keys cap near 2704 bytes and long product URLs would otherwise be un-insertable.';
comment on column public.products.embedding is
  '384-dim sentence embedding. embedding_model must be checked before comparing: vectors from different models are not comparable, and cosine distance between them is meaningless rather than merely wrong.';
comment on column public.products.status is
  'merged rows are retained, never deleted, so wish_items keep resolving. Follow merged_into for the survivor.';
comment on column public.products.popularity is
  'Denormalised counter. Acceptable here because catalogue data is public; the same pattern on wish_items would be a reservation leak.';

-- --- The three dedup indexes ------------------------------------------------
-- All three are `where status <> 'merged'`. A merged row keeps its old keys
-- (that is the whole point — it is the tombstone that redirects), so including
-- merged rows would make it impossible to insert the survivor it points at.
create unique index products_url_hash_uq
  on public.products (url_hash)
  where status <> 'merged' and source_url is not null;

create unique index products_merchant_title_uq
  on public.products (merchant_id, merchant_title_key)
  where status <> 'merged' and merchant_id is not null;

create unique index products_gtin_uq
  on public.products (gtin)
  where status <> 'merged' and gtin is not null;

-- Fuzzy product search over French titles.
create index products_title_trgm_idx
  on public.products using gin (title extensions.gin_trgm_ops);

-- The main browse/facet access path: "Maison, around 50 EUR".
create index products_category_band_idx
  on public.products (category_id, price_band)
  where status = 'active';

-- HNSW over cosine distance for semantic reco. HNSW rather than IVFFlat: it
-- needs no training step and no rebuild as the catalogue grows, which matters
-- when the table starts near-empty and fills continuously. Cosine because the
-- embeddings are direction-normalised; L2 on normalised vectors is monotonic
-- with cosine but the ops class must match how we query or the index is skipped.
create index products_embedding_hnsw_idx
  on public.products using hnsw (embedding extensions.vector_cosine_ops)
  where status = 'active';

-- Price refresh worklist: never-checked first, then oldest.
create index products_price_refresh_idx
  on public.products (price_checked_at nulls first)
  where status = 'active';

create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- product_tags
-- ---------------------------------------------------------------------------
create table public.product_tags (
  product_id uuid not null references public.products (id) on delete cascade,
  tag_id     uuid not null references public.tags (id) on delete cascade,

  -- Confidence, not importance. Model-assigned tags land below 1.0; editorial
  -- ones at exactly 1.0. Bounded so a bad model run cannot swamp ranking with
  -- a weight of 40.
  weight     real not null default 1.0 check (weight >= 0 and weight <= 1),

  primary key (product_id, tag_id)
);

comment on table public.product_tags is
  'Product-to-facet edges with confidence weights.';
comment on column public.product_tags.weight is
  'Confidence in [0,1], not importance. Bounded so a bad model run cannot dominate ranking.';

-- Reverse lookup: "products for the Café tag", ordered by confidence.
create index product_tags_tag_idx
  on public.product_tags (tag_id, weight desc);

-- ---------------------------------------------------------------------------
-- upsert_product
-- ---------------------------------------------------------------------------
-- The single write path into the catalogue. SECURITY DEFINER because
-- `authenticated` has no INSERT/UPDATE policy on products (see 0008): users add
-- products only by going through this function, which enforces dedup.
--
-- =========================================================================
--  THE TRAP THIS FUNCTION EXISTS TO HANDLE — read before "simplifying" it
-- =========================================================================
--  products has THREE partial unique indexes, but `ON CONFLICT` can only name
--  ONE arbiter. Postgres does not "try each unique index"; it watches the one
--  you named. Any violation of a DIFFERENT unique index is raised as a normal
--  unique_violation error and the statement aborts.
--
--  So `on conflict (url_hash) do update` handles the case where the same URL
--  is submitted twice, and raises 23505 for the case where the SAME PRODUCT
--  arrives under a SECOND URL — which collides on products_merchant_title_uq
--  instead. That second case is not an edge case. It is the most common
--  duplicate we get: apple.com/fr/macbook-air and apple.com/fr/shop/buy-mac/
--  macbook-air are one product, and the share sheet, the extension and the
--  affiliate feed each produce a different one.
--
--  Without the exception block below, ingestion returns a 500 on that path.
--  The `exception when unique_violation` handler re-selects by
--  (merchant_id, merchant_title_key) — the arbiter we could not name — and
--  updates that row instead.
--
--  Note also: a block with an EXCEPTION clause creates a subtransaction, so the
--  failed INSERT is rolled back cleanly and the caller's transaction survives.
--  That is required here; without the handler the whole batch dies.
-- =========================================================================
create or replace function public.upsert_product(
  p_title        text,
  p_source_url   text    default null,
  p_merchant_id  uuid    default null,
  p_brand        text    default null,
  p_description  text    default null,
  p_image_url    text    default null,
  p_price_cents  integer default null,
  p_currency     char(3) default 'EUR',
  p_gtin         text    default null,
  p_category_id  uuid    default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id       uuid;
  v_url_norm text := public.normalize_url(p_source_url);
  v_tkey     text := public.title_key(p_title);
begin
  if p_title is null or btrim(p_title) = '' then
    raise exception 'upsert_product: title is required';
  end if;

  -- Fast path: an existing row we can find without provoking a conflict at all.
  -- Ordered by identity strength — gtin, then url, then merchant+title.
  if p_gtin is not null then
    select id into v_id
    from public.products
    where gtin = p_gtin and status <> 'merged'
    limit 1;
  end if;

  if v_id is null and v_url_norm is not null then
    select id into v_id
    from public.products
    where url_hash = extensions.digest(v_url_norm, 'sha256')
      and status <> 'merged'
    limit 1;
  end if;

  if v_id is null and p_merchant_id is not null and v_tkey is not null then
    select id into v_id
    from public.products
    where merchant_id = p_merchant_id
      and merchant_title_key = v_tkey
      and status <> 'merged'
    limit 1;
  end if;

  if v_id is not null then
    update public.products p
       set title            = coalesce(p_title, p.title),
           brand            = coalesce(p_brand, p.brand),
           description      = coalesce(p_description, p.description),
           image_url        = coalesce(p_image_url, p.image_url),
           -- Only fill source_url if we do not have one; do not let a tracking
           -- URL overwrite a clean canonical one we already stored.
           source_url       = coalesce(p.source_url, p_source_url),
           merchant_id      = coalesce(p.merchant_id, p_merchant_id),
           gtin             = coalesce(p.gtin, p_gtin),
           category_id      = coalesce(p.category_id, p_category_id),
           price_cents      = coalesce(p_price_cents, p.price_cents),
           currency         = coalesce(p_currency, p.currency),
           price_checked_at = case when p_price_cents is not null
                                   then now() else p.price_checked_at end
     where p.id = v_id;
    return v_id;
  end if;

  -- Insert. The arbiter we can name is url_hash; everything else falls to the
  -- exception handler below.
  begin
    insert into public.products (
      merchant_id, title, brand, description, image_url, source_url,
      gtin, price_cents, currency, price_checked_at, category_id
    )
    values (
      p_merchant_id, p_title, p_brand, p_description, p_image_url, p_source_url,
      p_gtin, p_price_cents, coalesce(p_currency, 'EUR'),
      case when p_price_cents is not null then now() end,
      p_category_id
    )
    returning id into v_id;

    return v_id;

  exception
    when unique_violation then
      -- We collided on an index that was NOT the one we could arbitrate on:
      -- products_merchant_title_uq or products_gtin_uq. Re-select and update.
      -- This is the common "same product, two URLs" case described above.
      v_id := null;

      if p_merchant_id is not null and v_tkey is not null then
        select id into v_id
        from public.products
        where merchant_id = p_merchant_id
          and merchant_title_key = v_tkey
          and status <> 'merged'
        limit 1;
      end if;

      if v_id is null and p_gtin is not null then
        select id into v_id
        from public.products
        where gtin = p_gtin and status <> 'merged'
        limit 1;
      end if;

      if v_id is null and v_url_norm is not null then
        select id into v_id
        from public.products
        where url_hash = extensions.digest(v_url_norm, 'sha256')
          and status <> 'merged'
        limit 1;
      end if;

      if v_id is null then
        -- A unique_violation we cannot attribute to any known identity axis is
        -- a real bug. Do not swallow it.
        raise;
      end if;

      update public.products p
         set brand            = coalesce(p.brand, p_brand),
             description      = coalesce(p.description, p_description),
             image_url        = coalesce(p.image_url, p_image_url),
             source_url       = coalesce(p.source_url, p_source_url),
             merchant_id      = coalesce(p.merchant_id, p_merchant_id),
             gtin             = coalesce(p.gtin, p_gtin),
             category_id      = coalesce(p.category_id, p_category_id),
             price_cents      = coalesce(p_price_cents, p.price_cents),
             price_checked_at = case when p_price_cents is not null
                                     then now() else p.price_checked_at end
       where p.id = v_id;

      return v_id;
  end;
end;
$$;

comment on function public.upsert_product is
  'Sole write path into the catalogue. Catches unique_violation and re-selects by (merchant_id, merchant_title_key) because ON CONFLICT arbitrates exactly one index — the "same product, two URLs" collision hits a different index and would otherwise 500.';

revoke all on function public.upsert_product from public;
grant execute on function public.upsert_product to authenticated, service_role;
