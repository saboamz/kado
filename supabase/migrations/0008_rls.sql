-- 0008_rls.sql
--
-- Row level security for every table in `public`.
--
-- ===========================================================================
--  WHERE RLS SITS IN KADO'S SECURITY MODEL
--  =========================================================================
--  For the PUBLIC data in this file — profiles, follows, wishlists, wishes,
--  catalogue, notifications — RLS is the PRIMARY control. These tables are
--  intentionally reachable over PostgREST, so the policies below are the only
--  thing standing between a viewer and someone else's row. They must be right.
--
--  For the SECRET data in P5 — reservations, pots, contributions — RLS is
--  explicitly NOT the primary control. The primary control is that the
--  `private` schema is never added to PostgREST's exposed-schema list, so no
--  URL routes to those tables at all. RLS is applied there too, as defence in
--  depth, but it is the second line rather than the first.
--
--  That difference is deliberate and worth internalising: a correct RLS policy
--  on a reachable table still answers the request. It returns 200 with zero
--  rows, in an amount of time that depends on how much work it did filtering.
--  Against an adversary who is the wishlist OWNER — someone legitimately
--  authenticated, legitimately reading their own list, and merely curious
--  whether a row exists — response timing, row counts and Realtime events are
--  all signal. Non-exposure removes the question instead of answering it
--  carefully. Never rely on an RLS policy alone to keep a reservation secret.
-- ===========================================================================
--
-- Note on `force`: `enable row level security` does NOT apply to the table
-- owner, and migrations run as the owner. Without `force`, a SECURITY DEFINER
-- function owned by postgres bypasses every policy below without saying so.
-- We force it on every table so that the policies are the truth for everyone
-- except an explicit `service_role` bypass.
--
-- Note on `(select auth.uid())`: wrapping the call in a scalar subquery gets it
-- evaluated ONCE per statement instead of once per row. On a large scan that is
-- the difference between a policy that is free and one that dominates the
-- query. This is the single most impactful RLS performance idiom on Supabase.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.profiles force  row level security;

-- Kado is a social app: you must be able to find people to follow, so profiles
-- are readable by any authenticated user. Note this is authenticated-only, not
-- anon — profile enumeration by unauthenticated scrapers has no product value
-- and real privacy cost.
create policy profiles_select_authenticated
  on public.profiles for select
  to authenticated
  using (true);

create policy profiles_insert_self
  on public.profiles for insert
  to authenticated
  with check (id = (select auth.uid()));

-- `using` selects which rows may be updated; `with check` validates the result.
-- Both are required: without the check, a user could update their own row and
-- set id to someone else's, handing themselves that account's profile.
create policy profiles_update_self
  on public.profiles for update
  to authenticated
  using      (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No delete policy. Accounts are removed through auth.users, which cascades.
-- A direct profile delete would leave an authenticated session with no profile.

-- ---------------------------------------------------------------------------
-- follows
-- ---------------------------------------------------------------------------
alter table public.follows enable row level security;
alter table public.follows force  row level security;

-- Either party sees the edge: the requester needs to see it is pending, the
-- recipient needs to see it in their inbox.
create policy follows_select_either_party
  on public.follows for select
  to authenticated
  using (
    follower_id = (select auth.uid())
    or followee_id = (select auth.uid())
  );

-- You may only create a follow FROM yourself. Without this check a user could
-- insert (victim -> attacker, 'accepted') and manufacture one half of a
-- friendship; combined with their own half that is a full is_friend() bypass
-- and therefore read access to the victim's friends-only lists.
create policy follows_insert_as_follower
  on public.follows for insert
  to authenticated
  with check (
    follower_id = (select auth.uid())
    and follower_id <> followee_id
  );

-- The FOLLOWEE decides: accept, or block. The `using` clause restricts this
-- policy to rows where the caller is the followee, so the follower cannot
-- self-accept their own pending request.
create policy follows_update_by_followee
  on public.follows for update
  to authenticated
  using      (followee_id = (select auth.uid()))
  with check (followee_id = (select auth.uid()));

-- Either side may withdraw: the follower unfollows, the followee removes.
create policy follows_delete_either_party
  on public.follows for delete
  to authenticated
  using (
    follower_id = (select auth.uid())
    or followee_id = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- wishlists
-- ---------------------------------------------------------------------------
alter table public.wishlists enable row level security;
alter table public.wishlists force  row level security;

-- Delegated wholesale to can_view_wishlist so this rule and the wish_items rule
-- cannot drift apart. Archived lists stay visible to their owner only.
create policy wishlists_select_visible
  on public.wishlists for select
  to authenticated
  using (
    public.can_view_wishlist(id, (select auth.uid()))
    and (archived_at is null or owner_id = (select auth.uid()))
  );

create policy wishlists_insert_own
  on public.wishlists for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

-- with check mirrors using so a list cannot be reassigned to another owner.
create policy wishlists_update_own
  on public.wishlists for update
  to authenticated
  using      (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy wishlists_delete_own
  on public.wishlists for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- wish_items
-- ---------------------------------------------------------------------------
alter table public.wish_items enable row level security;
alter table public.wish_items force  row level security;

-- Visibility follows the parent list. This is the one place we accept a
-- function call that reads wishlists, and it is safe because
-- can_view_wishlist is SECURITY DEFINER and STABLE: the lookup is not itself
-- RLS-filtered (no circular dependency) and it is evaluated once per distinct
-- list rather than once per item.
create policy wish_items_select_visible
  on public.wish_items for select
  to authenticated
  using (public.can_view_wishlist(wishlist_id, (select auth.uid())));

-- Writes are owner-only, checked against the DENORMALISED owner_id rather than
-- through a join — see the comment on that column in 0006. Note that owner_id
-- is overwritten by the sync_wish_owner trigger regardless of what the client
-- sends, so this check cannot be defeated by forging it.
create policy wish_items_insert_own
  on public.wish_items for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy wish_items_update_own
  on public.wish_items for update
  to authenticated
  using      (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy wish_items_delete_own
  on public.wish_items for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- REMINDER: no policy here grants anyone the ability to record a reservation,
-- because there is no column to record it in and never will be. Friends'
-- reservation state lives in `private` (P5). See the block comment in 0006.

-- ---------------------------------------------------------------------------
-- catalogue: merchants, categories, tags, products, product_tags
-- ---------------------------------------------------------------------------
-- Read-only to every authenticated user; ALL writes go through SECURITY
-- DEFINER functions (public.upsert_product and its siblings).
--
-- The absence of insert/update/delete policies is the design, not an omission.
-- With RLS enabled and no permissive policy for a command, that command is
-- denied for `authenticated` — there is no way to write a row that bypasses
-- the dedup logic in upsert_product. If direct inserts were allowed, two users
-- adding the same product concurrently would create duplicate catalogue rows,
-- splitting the reco signal and the price refresh that the catalogue exists to
-- unify.

alter table public.merchants enable row level security;
alter table public.merchants force  row level security;
create policy merchants_select_authenticated
  on public.merchants for select to authenticated using (true);

alter table public.categories enable row level security;
alter table public.categories force  row level security;
create policy categories_select_authenticated
  on public.categories for select to authenticated using (true);

alter table public.tags enable row level security;
alter table public.tags force  row level security;
create policy tags_select_authenticated
  on public.tags for select to authenticated using (true);

alter table public.products enable row level security;
alter table public.products force  row level security;
-- Merged rows are tombstones for internal redirection, not catalogue entries;
-- hiding them keeps clients from rendering a superseded duplicate.
create policy products_select_authenticated
  on public.products for select
  to authenticated
  using (status <> 'merged');

alter table public.product_tags enable row level security;
alter table public.product_tags force  row level security;
create policy product_tags_select_authenticated
  on public.product_tags for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
alter table public.notifications enable row level security;
alter table public.notifications force  row level security;

create policy notifications_select_own
  on public.notifications for select
  to authenticated
  using (recipient_id = (select auth.uid()));

-- Recipients mark as read; they do not author. There is deliberately no INSERT
-- policy for `authenticated`: notifications are written by SECURITY DEFINER
-- functions and server-side jobs only. If users could insert notifications for
-- each other, the structured-payload defence in 0007 would be worthless —
-- anyone could hand-craft a `system` notification to an owner.
create policy notifications_update_own
  on public.notifications for update
  to authenticated
  using      (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

create policy notifications_delete_own
  on public.notifications for delete
  to authenticated
  using (recipient_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Table-level grants
-- ---------------------------------------------------------------------------
-- RLS narrows what a role can reach; it does not grant anything. Both layers
-- are required, and they are independent: a missing GRANT produces a permission
-- error, a missing POLICY produces silently zero rows.
--
-- `anon` gets nothing at all. Every Kado read is on behalf of a known person;
-- there is no logged-out browsing surface in the product.

grant usage on schema public to anon, authenticated;

grant select                         on public.profiles      to authenticated;
grant insert, update                 on public.profiles      to authenticated;
grant select, insert, update, delete on public.follows       to authenticated;
grant select, insert, update, delete on public.wishlists     to authenticated;
grant select, insert, update, delete on public.wish_items    to authenticated;
grant select                         on public.merchants     to authenticated;
grant select                         on public.categories    to authenticated;
grant select                         on public.tags          to authenticated;
grant select                         on public.products      to authenticated;
grant select                         on public.product_tags  to authenticated;
grant select, update, delete         on public.notifications to authenticated;
