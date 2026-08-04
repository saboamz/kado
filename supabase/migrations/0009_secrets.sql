-- 0009_secrets.sql
--
-- The three tables an owner must never read: reservations, pots and the
-- contributions that fund them.
--
-- WHY THESE LIVE IN `private` AND NOT IN `public` WITH AN RLS POLICY
--
-- The tempting design is public.reservations with
--   create policy hide_from_owner on public.reservations for select
--     using (reserver_id = auth.uid());   -- an owner never matches
-- and it is *nearly* right. It is rejected as the PRIMARY control for three
-- reasons:
--
--   1. Policies are OR-combined and there is no way to write "and never this".
--      Any future permissive SELECT policy — for an admin panel, an analytics
--      view, a "who reserved this" feature — widens the union immediately, and
--      the guarantee depends on every future policy author remembering.
--   2. PostgREST exposes filters, embeds and count headers. Even with a correct
--      policy, `?select=wish_item_id&wish_item_id=eq.X`, `Prefer: count=exact`
--      and `wish_items?select=*,reservations(count)` each need separate
--      reasoning. Reducing the reachable surface to zero beats auditing N query
--      shapes forever.
--   3. Realtime. A reservation that touches the owner's row is a timing oracle
--      whatever the policies say.
--
-- So: these tables are in a schema that is NOT in Supabase's exposed-schemas
-- list. `GET /rest/v1/reservations` is 404 for everyone, always, including the
-- app itself. RLS below is defence in depth, not the control.
--
-- The client reaches this data only through the SECURITY DEFINER functions in
-- 0010_secret_rpcs.sql, which are audited one at a time.

-- ---------------------------------------------------------------------------
-- reservations
-- ---------------------------------------------------------------------------
create table private.reservations (
  id           uuid primary key default gen_random_uuid(),

  wish_item_id uuid not null references public.wish_items (id) on delete cascade,

  -- Denormalised from wish_items.owner_id. Every guard in this file asks "who
  -- owns the item this row points at", and a join through public.wish_items
  -- inside a hot security-definer path is both slower and easier to get subtly
  -- wrong than a column. Kept honest by the trigger below.
  owner_id     uuid not null references public.profiles (id) on delete cascade,

  reserver_id  uuid not null references public.profiles (id) on delete cascade,

  quantity     smallint not null default 1 check (quantity > 0),
  state        public.reservation_state not null default 'held',

  -- A note from the reserver to other friends ("je prends la housse aussi").
  -- Never shown to the owner, and never returned by any RPC the owner can call.
  message      text check (char_length(message) <= 280),

  reserved_at  timestamptz not null default now(),
  purchased_at timestamptz,
  released_at  timestamptz,

  -- Without this, an owner reserves their own item and then legitimately reads
  -- it back through "my reservations" — a self-oracle that confirms the table
  -- exists and that their item is in it. Blocking it at the constraint level
  -- closes the hole for every future code path at once, not just today's.
  constraint no_self_reserve check (owner_id <> reserver_id),

  -- released rows keep their timestamp; live rows must not claim one.
  constraint released_has_time check (
    (state = 'released') = (released_at is not null)
  )
);

-- One live hold per (item, reserver). Partial, so a released reservation does
-- not block the same friend from reserving again later.
create unique index reservations_live_uq
  on private.reservations (wish_item_id, reserver_id)
  where state in ('held', 'purchased');

create index reservations_item
  on private.reservations (wish_item_id)
  where state <> 'released';

create index reservations_reserver
  on private.reservations (reserver_id, reserved_at desc);

comment on table private.reservations is
  'Who holds which wish. In `private` because PostgREST must not be able to reach it under any query shape; RLS below is defence in depth.';
comment on column private.reservations.owner_id is
  'Denormalised from wish_items so guards never join public tables in a hot path. Maintained by sync_reservation_owner().';
comment on constraint no_self_reserve on private.reservations is
  'An owner reserving their own item could read it back via "my reservations" and confirm the table holds their list.';

-- ---------------------------------------------------------------------------
-- pots
-- ---------------------------------------------------------------------------
--
-- Replaces the prototype's `POT_TOTAL = 1599` module constant and the two
-- scalars in the React store, which between them allowed exactly one pot to
-- exist in the entire application.
--
-- The pot is the LOUDEST secret in the product. "650 € / 1 599 €" tells the
-- owner outright that a gift is being bought for them — worse than a per-item
-- flag, because it also reveals which one and how far along it is.
create table private.pots (
  id           uuid primary key default gen_random_uuid(),

  -- One pot per wish. The natural key, and it makes "does this wish have a
  -- pot" a single indexed lookup.
  wish_item_id uuid not null unique references public.wish_items (id) on delete cascade,

  owner_id     uuid not null references public.profiles (id) on delete cascade,

  target_cents integer not null check (target_cents > 0),
  currency     char(3) not null default 'EUR',
  state        public.pot_state not null default 'open',

  -- The friend who started it. May be null after account deletion; the pot
  -- survives because contributors still have money in it.
  organizer_id uuid references public.profiles (id) on delete set null,

  deadline     date,
  created_at   timestamptz not null default now(),
  closed_at    timestamptz
);

create index pots_owner on private.pots (owner_id);

comment on table private.pots is
  'Collaborative gift pots. The loudest secret in the product: a total tells the owner a gift is being bought and how far along it is.';

-- ---------------------------------------------------------------------------
-- contributions
-- ---------------------------------------------------------------------------
create table private.contributions (
  id             uuid primary key default gen_random_uuid(),
  pot_id         uuid not null references private.pots (id) on delete cascade,
  contributor_id uuid not null references public.profiles (id) on delete cascade,

  amount_cents   integer not null check (amount_cents > 0),
  currency       char(3) not null default 'EUR',
  state          public.contribution_state not null default 'pending',

  -- Stripe PaymentIntent. Unique so a webhook replay cannot double-credit a
  -- pot: the second insert violates the constraint instead of adding money.
  psp_intent_id  text unique,

  -- Contributions are anonymous to everyone but the contributor. This flag
  -- exists for a future "signed" mode among friends; it can never expose a
  -- name to the beneficiary, who cannot reach this table at all.
  anonymous      boolean not null default true,

  created_at     timestamptz not null default now(),
  captured_at    timestamptz
);

create index contributions_pot
  on private.contributions (pot_id)
  where state = 'captured';

create index contributions_user
  on private.contributions (contributor_id, created_at desc);

comment on table private.contributions is
  'Money in a pot. The total is always SUM(captured), never a stored counter, so it cannot drift from the payment ledger.';
comment on column private.contributions.psp_intent_id is
  'Unique so a replayed Stripe webhook violates the constraint instead of crediting the pot twice.';

-- ---------------------------------------------------------------------------
-- Keep the denormalised owner_id honest
-- ---------------------------------------------------------------------------
create or replace function private.sync_reservation_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Deliberately overwrites whatever was supplied. owner_id is derived data;
  -- accepting a caller's value would let a forged insert point a reservation
  -- at the wrong owner and slip past every guard that reads this column.
  select wi.owner_id into new.owner_id
  from public.wish_items wi
  where wi.id = new.wish_item_id;

  if new.owner_id is null then
    raise exception 'unknown wish item %', new.wish_item_id
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger reservations_owner_sync
  before insert or update of wish_item_id on private.reservations
  for each row execute function private.sync_reservation_owner();

create or replace function private.sync_pot_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select wi.owner_id into new.owner_id
  from public.wish_items wi
  where wi.id = new.wish_item_id;

  if new.owner_id is null then
    raise exception 'unknown wish item %', new.wish_item_id
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger pots_owner_sync
  before insert or update of wish_item_id on private.pots
  for each row execute function private.sync_pot_owner();

-- ---------------------------------------------------------------------------
-- RLS: the second lock, not the first
-- ---------------------------------------------------------------------------
--
-- If someone ever exposes `private` by accident — it is one toggle in a
-- dashboard, outside version control — these policies are what stands between
-- that mistake and the product's central promise.
--
-- FORCE matters as much as ENABLE: without it the table-owning role bypasses
-- RLS entirely, and Supabase's postgres/supabase_admin connections are that
-- role.
alter table private.reservations  enable row level security;
alter table private.reservations  force  row level security;
alter table private.pots          enable row level security;
alter table private.pots          force  row level security;
alter table private.contributions enable row level security;
alter table private.contributions force  row level security;

-- SELECT only, and only your own rows. There are deliberately no INSERT,
-- UPDATE or DELETE policies: every write goes through a SECURITY DEFINER
-- function that checks the rules first.
create policy reservations_self_only on private.reservations
  for select to authenticated
  using (reserver_id = (select auth.uid()));

create policy contributions_self_only on private.contributions
  for select to authenticated
  using (contributor_id = (select auth.uid()));

-- A pot is visible to whoever can see the wish it funds — and never to the
-- person the wish belongs to, which the second predicate enforces even though
-- can_view_wishlist would return true for them.
create policy pots_visible_to_friends on private.pots
  for select to authenticated
  using (
    owner_id <> (select auth.uid())
    and exists (
      select 1
      from public.wish_items wi
      where wi.id = wish_item_id
        and public.can_view_wishlist(wi.wishlist_id, (select auth.uid()))
    )
  );

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
-- Belt and braces over the schema-level REVOKE in 0001: even if the schema
-- became reachable, the roles hold no table privileges to exercise.
revoke all on all tables in schema private from anon, authenticated;
revoke all on all sequences in schema private from anon, authenticated;
revoke all on all functions in schema private from anon, authenticated;
