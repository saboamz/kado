-- 0010_secret_rpcs.sql
--
-- The complete list of what a client may do with the tables in `private`.
-- Every function here is SECURITY DEFINER with `set search_path = ''`, granted
-- only to `authenticated`, and audited individually. If a capability is not in
-- this file, the client does not have it.
--
-- THE SHAPE OF EVERY GUARD
--
-- When an owner asks about their own list, these functions raise 42704
-- (undefined_object) with the message 'not found' — the SAME error a stranger
-- gets for a list they cannot see. Not an empty result set, because "empty"
-- and "forbidden" are distinguishable and the difference is itself the secret.
-- Both paths do one indexed lookup before raising, so they are not
-- distinguishable by timing either.

-- ---------------------------------------------------------------------------
-- Shared guard
-- ---------------------------------------------------------------------------
create or replace function private.assert_not_owner(p_wishlist uuid, p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.wishlists where id = p_wishlist;

  -- Unknown list, own list, or a list you cannot see: one identical error.
  -- Collapsing the three is the point. Distinct errors would let an owner
  -- enumerate which of their lists carry reservations.
  if v_owner is null
     or v_owner = p_uid
     or not public.can_view_wishlist(p_wishlist, p_uid)
  then
    raise exception 'not found' using errcode = '42704';
  end if;
end;
$$;

comment on function private.assert_not_owner(uuid, uuid) is
  'Raises an identical 42704 for unknown / own / invisible lists, so an owner cannot distinguish the three.';

-- ---------------------------------------------------------------------------
-- Read: reservation state of someone else's list
-- ---------------------------------------------------------------------------
--
-- Returns booleans, never reserver_id. A friend must not learn WHICH friend
-- took an item either: that is a weaker but real privacy property, and more
-- importantly it stops an owner from social-engineering one friend into
-- revealing the whole set.
create or replace function public.list_reservation_state(p_wishlist uuid)
returns table (wish_item_id uuid, taken boolean, mine boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not found' using errcode = '42704';
  end if;

  perform private.assert_not_owner(p_wishlist, v_uid);

  return query
  select wi.id,
         exists (
           select 1 from private.reservations r
           where r.wish_item_id = wi.id
             and r.state in ('held', 'purchased')
         ),
         exists (
           select 1 from private.reservations r
           where r.wish_item_id = wi.id
             and r.state in ('held', 'purchased')
             and r.reserver_id = v_uid
         )
  from public.wish_items wi
  where wi.wishlist_id = p_wishlist
    and wi.status = 'active';
end;
$$;

comment on function public.list_reservation_state(uuid) is
  'Per-item taken/mine booleans for a list you do not own. Never returns reserver_id: friends must not learn which friend took what.';

-- ---------------------------------------------------------------------------
-- Write: reserve / release
-- ---------------------------------------------------------------------------
create or replace function public.reserve_item(
  p_item uuid,
  p_quantity smallint default 1,
  p_message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_owner uuid;
  v_list  uuid;
begin
  if v_uid is null then
    raise exception 'not found' using errcode = '42704';
  end if;

  select wi.owner_id, wi.wishlist_id into v_owner, v_list
  from public.wish_items wi
  where wi.id = p_item and wi.status = 'active';

  if v_owner is null then
    raise exception 'not found' using errcode = '42704';
  end if;

  perform private.assert_not_owner(v_list, v_uid);

  insert into private.reservations (wish_item_id, owner_id, reserver_id, quantity, message)
  values (p_item, v_owner, v_uid, p_quantity, p_message)
  on conflict (wish_item_id, reserver_id) where state in ('held', 'purchased')
  do update set state = 'held', released_at = null;
end;
$$;

create or replace function public.release_item(p_item uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not found' using errcode = '42704';
  end if;

  -- Scoped to the caller's own reservation, so this cannot be used to release
  -- someone else's hold — nor to probe whether one exists: the update simply
  -- affects zero rows and returns quietly either way.
  update private.reservations
  set state = 'released', released_at = now()
  where wish_item_id = p_item
    and reserver_id = v_uid
    and state in ('held', 'purchased');
end;
$$;

comment on function public.release_item(uuid) is
  'Releases only the caller''s own hold, and reports nothing either way, so it cannot probe for others'' reservations.';

-- ---------------------------------------------------------------------------
-- Read: pot state
-- ---------------------------------------------------------------------------
--
-- The contributor count is BUCKETED, not exact. If an owner ever obtains a
-- friend's screenshot, '2-5' tells them materially less than '3' — and an
-- exact count that ticks up is a channel in its own right.
create or replace function public.get_pot_state(p_item uuid)
returns table (
  target_cents  integer,
  raised_cents  bigint,
  currency      char(3),
  state         public.pot_state,
  contributors  text,
  mine_cents    bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_list uuid;
  v_pot  uuid;
  v_n    integer;
begin
  if v_uid is null then
    raise exception 'not found' using errcode = '42704';
  end if;

  select wi.wishlist_id into v_list from public.wish_items wi where wi.id = p_item;
  if v_list is null then
    raise exception 'not found' using errcode = '42704';
  end if;

  perform private.assert_not_owner(v_list, v_uid);

  select id into v_pot from private.pots where wish_item_id = p_item;
  if v_pot is null then
    raise exception 'not found' using errcode = '42704';
  end if;

  select count(distinct c.contributor_id) into v_n
  from private.contributions c
  where c.pot_id = v_pot and c.state = 'captured';

  return query
  select p.target_cents,
         -- Always summed, never a stored counter, so it cannot drift from the
         -- payment ledger.
         coalesce((select sum(c.amount_cents) from private.contributions c
                   where c.pot_id = p.id and c.state = 'captured'), 0),
         p.currency,
         p.state,
         case when v_n = 0 then '0'
              when v_n = 1 then '1'
              when v_n <= 5 then '2-5'
              else '6+' end,
         coalesce((select sum(c.amount_cents) from private.contributions c
                   where c.pot_id = p.id and c.state = 'captured'
                     and c.contributor_id = v_uid), 0)
  from private.pots p
  where p.id = v_pot;
end;
$$;

comment on function public.get_pot_state(uuid) is
  'Pot state for a friend. Contributor count is bucketed rather than exact: an exact number that ticks up is itself a channel.';

-- ---------------------------------------------------------------------------
-- Write: contribute to a pot
-- ---------------------------------------------------------------------------
--
-- Records an intent to contribute. Real money arrives in P8: this inserts a
-- `pending` row, and only the Stripe webhook moves it to `captured`, which is
-- the state get_pot_state() sums. So a contribution that is never paid for
-- cannot inflate the total.
create or replace function public.contribute(
  p_item uuid,
  p_amount_cents integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_list  uuid;
  v_pot   uuid;
begin
  if v_uid is null or p_amount_cents <= 0 then
    raise exception 'not found' using errcode = '42704';
  end if;

  select wi.wishlist_id into v_list from public.wish_items wi where wi.id = p_item;
  if v_list is null then
    raise exception 'not found' using errcode = '42704';
  end if;

  perform private.assert_not_owner(v_list, v_uid);

  select id into v_pot from private.pots where wish_item_id = p_item and state = 'open';
  if v_pot is null then
    raise exception 'not found' using errcode = '42704';
  end if;

  insert into private.contributions (pot_id, contributor_id, amount_cents)
  values (v_pot, v_uid, p_amount_cents);
end;
$$;

comment on function public.contribute(uuid, integer) is
  'Records a pending contribution. Only a captured payment counts toward the total, so an unpaid intent cannot inflate it.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- `public` in a GRANT means "every role", which would include anon. Revoke
-- first, then grant explicitly to authenticated only.
revoke all on function public.list_reservation_state(uuid) from public;
revoke all on function public.reserve_item(uuid, smallint, text) from public;
revoke all on function public.release_item(uuid) from public;
revoke all on function public.get_pot_state(uuid) from public;
revoke all on function public.contribute(uuid, integer) from public;
revoke all on function private.assert_not_owner(uuid, uuid) from public;

grant execute on function public.list_reservation_state(uuid) to authenticated;
grant execute on function public.reserve_item(uuid, smallint, text) to authenticated;
grant execute on function public.release_item(uuid) to authenticated;
grant execute on function public.get_pot_state(uuid) to authenticated;
grant execute on function public.contribute(uuid, integer) to authenticated;
