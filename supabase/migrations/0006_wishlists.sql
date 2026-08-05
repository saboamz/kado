-- 0006_wishlists.sql
--
-- Wishlists and the wishes inside them. This is the table a wishlist owner
-- reads constantly, which makes it the table where the secrecy rule is most
-- easily broken. Read the big comment on wish_items before adding a column.

-- ---------------------------------------------------------------------------
-- wishlists
-- ---------------------------------------------------------------------------
create table public.wishlists (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,

  -- 60 chars: "Anniversaire", "Maison", "Voyage", "Noël", "Liste de mariage
  -- d'Emma et Paul" all fit; anything longer is a description, not a title.
  title       text not null check (char_length(title) between 1 and 60),

  -- Per-owner URL slug: /sophie/anniversaire. citext so /Anniversaire and
  -- /anniversaire resolve to one list rather than 404ing on the wrong case.
  slug        extensions.citext check (slug is null or slug ~ '^[a-z0-9-]{1,60}$'),

  -- Free text ('Anniversaire', 'Noël', 'Mariage', 'Crémaillère'). Deliberately
  -- not an enum: occasions are cultural and open-ended, and an enum would mean
  -- a migration every time someone has a baby shower.
  occasion    text,

  -- The date the list is FOR (birthday, wedding), not a deadline. Drives "dans
  -- 12 j" countdowns and the reminder cron.
  event_date  date,
  cover_url   text,

  visibility  public.visibility not null default 'friends',

  -- Unsguessable capability token for visibility='link'. Generated server-side
  -- from a CSPRNG; 32 bytes base64 is well beyond brute-force over HTTP. Unique
  -- so a token resolves to exactly one list. Null unless a link is issued, so
  -- a list that has never been shared has no token to leak.
  share_token text unique,

  -- Soft delete. Hard-deleting a list would cascade to wish_items and orphan
  -- P5 reservations against wishes that no longer exist, so lists are archived
  -- rather than removed.
  archived_at timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (owner_id, slug)
);

comment on table public.wishlists is
  'A named collection of wishes. Archived rather than deleted so P5 reservations never dangle against a removed wish.';
comment on column public.wishlists.slug is
  'Per-owner URL segment, citext so case variants resolve to one list instead of 404ing.';
comment on column public.wishlists.occasion is
  'Free text, not an enum: occasions are open-ended and an enum means a migration per life event.';
comment on column public.wishlists.share_token is
  'CSPRNG capability token for visibility=''link''. Null until a link is issued, so an unshared list has no token to leak.';
comment on column public.wishlists.visibility is
  '''link'' is unlisted-with-token and must never surface in search or a friend feed; only ''public'' may.';

create index wishlists_owner_idx
  on public.wishlists (owner_id, created_at desc)
  where archived_at is null;

-- Friend-visible list lookups and the feed.
create index wishlists_visibility_idx
  on public.wishlists (visibility, updated_at desc)
  where archived_at is null;

-- Countdown / reminder cron.
create index wishlists_event_date_idx
  on public.wishlists (event_date)
  where event_date is not null and archived_at is null;

create trigger wishlists_touch_updated_at
  before update on public.wishlists
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- wish_items
-- ---------------------------------------------------------------------------
create table public.wish_items (
  id          uuid primary key default gen_random_uuid(),
  wishlist_id uuid not null references public.wishlists (id) on delete cascade,

  -- DENORMALISED from wishlists.owner_id, maintained by sync_wish_owner() below.
  --
  -- Why duplicate it instead of joining: every reservation policy in P5 has to
  -- answer "who owns this item" — that is the whole basis of "the owner must
  -- not see this row". Expressing that as a join through wishlists inside an
  -- RLS predicate is bad twice over.
  --
  --   Slow: the predicate runs per candidate row, so each row costs a lookup
  --   into wishlists. On a reservation query spanning a friend's whole list
  --   that is a join per item, and RLS predicates cannot be hoisted the way a
  --   normal join can.
  --
  --   Easy to get wrong: a policy written as `exists (select 1 from wishlists w
  --   where w.id = wish_items.wishlist_id and w.owner_id <> auth.uid())` is
  --   itself subject to RLS on wishlists. If the viewer cannot see that
  --   wishlist row, the EXISTS collapses to false and the policy silently
  --   inverts — failing open or closed depending on how it was phrased. A
  --   plain column comparison has no such failure mode.
  --
  -- The denormalisation is safe because it is trigger-maintained and owner_id
  -- is otherwise immutable: a wish only changes owner if it is moved to another
  -- list, which re-fires the trigger.
  owner_id    uuid not null references public.profiles (id) on delete cascade,

  -- Nullable on purpose. Not every wish is a catalogue product: "Week-end en
  -- Islande" and "Un cours de poterie" are real, common wishes with no URL, no
  -- merchant and no price feed. Forcing a product row for them would fill the
  -- catalogue with one-off junk that pollutes dedup and reco.
  product_id  uuid references public.products (id) on delete set null,

  -- Snapshot, not a mirror of products.title. The owner edits it freely
  -- ("AirPods Pro 3 — embouts M") and a merchant renaming their page must not
  -- silently rewrite someone's wishlist.
  title       text not null check (char_length(title) between 1 and 140),

  -- The "desc" field from the prototype: sizes, colours, preferences.
  note        text check (char_length(note) <= 500),
  image_url   text,

  -- Integer cents + currency. Snapshotted from the product at add time so a
  -- price change does not silently move a pot's target under the contributors.
  price_cents integer check (price_cents is null or price_cents >= 0),
  currency    char(3) not null default 'EUR',

  -- 1 = "Ce serait sympa", 2 = "J'en ai vraiment envie", 3 = "Coup de cœur".
  priority    smallint not null default 2 check (priority between 1 and 3),

  -- "I would like three of these." Capped at 20 because beyond that it is a
  -- registry line item, not a wish, and an uncapped quantity is a denial of
  -- service on the P5 reservation fan-out.
  quantity    smallint not null default 1 check (quantity between 1 and 20),

  -- Set BY THE OWNER only. Never by a reservation or a purchase — see below.
  status      public.wish_status not null default 'active',

  -- Collaborative gift: friends chip in rather than one person buying it.
  -- The pot itself lives in `private` (P5); this flag is only the owner's
  -- intent that it SHOULD be a pot, which is public and leaks nothing. Whether
  -- anyone has actually contributed is exactly what this table must not know.
  is_pot      boolean not null default false,

  -- Manual drag-to-reorder position. Sparse integers so a reorder rewrites one
  -- row instead of renumbering the list.
  position    integer not null default 0,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- A pot needs a target to divide into shares. Without a price there is
  -- nothing to fund and the progress bar has no denominator.
  constraint pot_needs_price check (not is_pot or price_cents is not null)
);

-- ===========================================================================
--  DO NOT ADD A reserved_count / is_reserved / reserved_by / taken COLUMN
--  ===========================================================================
--
--  It will be proposed. It is the obvious optimisation: the friend-facing list
--  view wants to grey out already-claimed items, and a counter here would save
--  a join to the reservations table. It is also the single change that would
--  break Kado's core promise, and RLS CANNOT SAVE YOU FROM IT.
--
--  The reasoning, in full, because the next person needs it:
--
--  1. RLS filters WHICH ROWS YOU READ. It does not hide THAT A ROW CHANGED.
--     If reserving a gift writes to the owner's wish_items row, then:
--
--       * Supabase Realtime publishes wish_items to any subscriber with read
--         access to that row. The owner has read access to their own row — by
--         definition, it is their wishlist. So the owner's open list view
--         receives a change event at the exact moment a friend reserves. Even
--         if every reservation-specific column were somehow filtered out, the
--         EVENT ITSELF is the leak: a row that updates the instant a friend
--         closes the tab tells the owner everything.
--
--       * updated_at moves. The list reorders. The ETag changes. The row's
--         xmin changes and so does its physical position, which is observable
--         through timing on a large list. Any of these is enough.
--
--  2. It is a timing oracle even without Realtime. An owner who polls their own
--     list and diffs it learns not just THAT something was reserved but WHICH
--     ITEM and WHEN — which, combined with who was online, usually identifies
--     the buyer. That is strictly worse than the plaintext leak.
--
--  3. "But I will protect it with a column-level grant / a view / a policy"
--     does not help, because none of those suppress the write itself, and the
--     write is the signal.
--
--  THEREFORE: nothing in the reservation path may write to public.wish_items.
--  Reservations, holds, purchases, pots and contributions live in the `private`
--  schema (P5), keyed BY wish_item_id, and are joined only in queries run by
--  the FRIEND. The owner's own read path never touches them. The counter the UI
--  wants is computed for friends at read time from private.reservations; the
--  owner's view has no such number and must not be able to derive one.
--
--  If you find yourself needing a denormalised count for performance, put it in
--  `private`, keyed by wish_item_id, and never let it be read by the owner.
-- ===========================================================================

comment on table public.wish_items is
  'Wishes. Owner-readable, therefore RESERVATION STATE MUST NEVER BE STORED OR UPDATED HERE — a write to this table is a Realtime timing oracle regardless of RLS. See the block comment in 0006_wishlists.sql.';
comment on column public.wish_items.owner_id is
  'Denormalised from wishlists.owner_id via sync_wish_owner(). Every P5 reservation policy needs "who owns this item"; a join through wishlists inside an RLS predicate is slow (per-row) and unsafe (the subquery is itself RLS-filtered and can silently invert the policy).';
comment on column public.wish_items.product_id is
  'Nullable: free-text wishes ("Week-end en Islande") have no catalogue product, and forcing one would pollute dedup and reco with one-off rows.';
comment on column public.wish_items.title is
  'Snapshot, not a mirror of products.title. A merchant renaming their page must not rewrite a user''s wishlist.';
comment on column public.wish_items.price_cents is
  'Snapshotted at add time so a merchant price change cannot move a pot target under the people already funding it.';
comment on column public.wish_items.status is
  'Set by the OWNER only. A reservation or purchase must never flip this to ''fulfilled'' — that would be the loudest possible leak.';
comment on column public.wish_items.is_pot is
  'Owner''s intent that this be collaborative. Public and harmless. Whether anyone has actually contributed lives in `private` and must not be inferable here.';
comment on column public.wish_items.quantity is
  'Capped at 20: beyond that it is a registry line, and an uncapped value is a DoS on the P5 reservation fan-out.';

create index wish_items_list_position_idx
  on public.wish_items (wishlist_id, position, created_at)
  where status = 'active';

-- P5 joins from a reservation back to its wish; also the owner's "all my
-- wishes" view.
create index wish_items_owner_idx on public.wish_items (owner_id);

-- "Who else wants this product" — the collaborative-filtering signal.
create index wish_items_product_idx
  on public.wish_items (product_id)
  where product_id is not null;

create trigger wish_items_touch_updated_at
  before update on public.wish_items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- sync_wish_owner
-- ---------------------------------------------------------------------------
-- Keeps the denormalised owner_id honest. BEFORE INSERT OR UPDATE OF
-- wishlist_id: on insert we always derive it, and on update we only re-derive
-- when the item actually moves lists, so a routine title edit does not pay for
-- a lookup.
--
-- Deriving rather than trusting the client is the point: if owner_id were
-- client-supplied, a caller could set it to someone else and every P5 policy
-- keyed on it would be evaluating an attacker-controlled value.
create or replace function public.sync_wish_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select w.owner_id into v_owner
  from public.wishlists w
  where w.id = new.wishlist_id;

  if v_owner is null then
    raise exception 'sync_wish_owner: wishlist % not found', new.wishlist_id;
  end if;

  new.owner_id := v_owner;
  return new;
end;
$$;

comment on function public.sync_wish_owner() is
  'Derives wish_items.owner_id from the parent list. Never trust a client-supplied owner_id: P5 reservation policies key on it, so a forged value would be an authorisation bypass.';

-- Note the column list on UPDATE: this fires only when wishlist_id itself
-- changes. It is deliberately NOT a blanket BEFORE UPDATE, which would run a
-- wishlists lookup on every price or note edit.
create trigger wish_items_sync_owner
  before insert or update of wishlist_id on public.wish_items
  for each row execute function public.sync_wish_owner();

-- ---------------------------------------------------------------------------
-- can_view_wishlist
-- ---------------------------------------------------------------------------
-- Single source of truth for list visibility, called from the RLS policies on
-- both wishlists and wish_items so the two can never disagree.
--
-- STABLE for the same planner reason as is_friend: a VOLATILE predicate
-- function re-runs per candidate row and turns a list read quadratic.
--
-- SECURITY DEFINER because it must read wishlists.visibility for a list the
-- caller may not (yet) be allowed to SELECT — that is precisely the question
-- being asked. Without DEFINER the lookup is itself RLS-filtered and the
-- function returns false for every list the caller does not already have
-- access to, which is circular.
--
-- 'link' is intentionally NOT handled here. A token-bearing viewer is
-- authorised by presenting the token, not by identity, so it is resolved by a
-- separate token lookup path. Returning true for 'link' here would make every
-- unlisted list readable by anyone who could guess its id, which is exactly the
-- property the token exists to prevent.
create or replace function public.can_view_wishlist(list uuid, viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.wishlists w
    where w.id = list
      and (
            w.owner_id = viewer                                    -- always
         or w.visibility = 'public'                                -- always
         or (w.visibility = 'friends' and public.is_friend(w.owner_id, viewer))
         -- 'link' deliberately absent: token path only.
      )
  )
$$;

comment on function public.can_view_wishlist(uuid, uuid) is
  'Visibility oracle shared by the wishlists and wish_items policies so they cannot drift. STABLE (per-row re-evaluation would be quadratic) and SECURITY DEFINER (the visibility lookup would otherwise be RLS-filtered by the very question it is answering). ''link'' is excluded on purpose — token bearers are authorised by token, not identity.';

revoke all on function public.can_view_wishlist(uuid, uuid) from public;
grant execute on function public.can_view_wishlist(uuid, uuid) to authenticated, service_role;
