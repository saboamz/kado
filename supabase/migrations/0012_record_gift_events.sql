-- 0012_record_gift_events.sql
--
-- Wires the giving RPCs to the event log.
--
-- These are the events collaborative filtering actually learns from — the
-- giver × product matrix is built from `reserve`, `purchase` and `contribute`
-- and nothing else. Until this migration they were never recorded, so the
-- matrix would have been empty no matter how good the model was.
--
-- Recording happens INSIDE the function that performs the action, in the same
-- transaction, so an event exists exactly when the thing it describes did. A
-- client-side call after the fact would drift the moment a request failed
-- between the two.

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

  -- The signal CF is built on.
  perform reco.record_gift_event(v_uid, 'reserve', v_owner, p_item);
end;
$$;

create or replace function public.release_item(p_item uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_released boolean;
  v_owner   uuid;
begin
  if v_uid is null then
    raise exception 'not found' using errcode = '42704';
  end if;

  with released as (
    update private.reservations
    set state = 'released', released_at = now()
    where wish_item_id = p_item
      and reserver_id = v_uid
      and state in ('held', 'purchased')
    returning owner_id
  )
  select true, owner_id into v_released, v_owner from released;

  -- Only record a reversal that actually reversed something. Logging
  -- unconditionally would let a caller manufacture negative signal against any
  -- product by calling release on a gift they never held.
  if coalesce(v_released, false) then
    perform reco.record_gift_event(v_uid, 'unreserve', v_owner, p_item);
  end if;
end;
$$;

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
  v_owner uuid;
  v_pot   uuid;
begin
  if v_uid is null or p_amount_cents <= 0 then
    raise exception 'not found' using errcode = '42704';
  end if;

  select wi.wishlist_id, wi.owner_id into v_list, v_owner
  from public.wish_items wi where wi.id = p_item;
  if v_list is null then
    raise exception 'not found' using errcode = '42704';
  end if;

  perform private.assert_not_owner(v_list, v_uid);

  select id into v_pot from private.pots
  where wish_item_id = p_item and state = 'open';
  if v_pot is null then
    raise exception 'not found' using errcode = '42704';
  end if;

  insert into private.contributions (pot_id, contributor_id, amount_cents)
  values (v_pot, v_uid, p_amount_cents);

  perform reco.record_gift_event(v_uid, 'contribute', v_owner, p_item);
end;
$$;

comment on function public.release_item(uuid) is
  'Releases only the caller''s own hold, reports nothing either way, and records a reversal only when one actually occurred.';
