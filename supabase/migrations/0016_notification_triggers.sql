-- 0016_notification_triggers.sql
--
-- What actually creates notifications, and the guard that keeps the secrecy
-- rule intact while doing it.
--
-- The table has existed since P4 with a structured shape — a `kind` and a
-- payload, never prose — but nothing wrote to it. Now that something does,
-- every write path needs the same question asked: can this row tell the
-- recipient something about their own gifts?
--
-- The answer is enforced in ONE place, private.notify(), rather than at each
-- call site. A guard repeated at five call sites is a guard forgotten at the
-- sixth.

-- ---------------------------------------------------------------------------
-- The single write path
-- ---------------------------------------------------------------------------
create or replace function private.notify(
  p_recipient    uuid,
  p_kind         public.notif_kind,
  p_actor        uuid default null,
  p_subject_type text default null,
  p_subject_id   uuid default null,
  p_payload      jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Nobody is notified about their own actions. Without this, adding a wish
  -- to your own list would notify you about it, which is noise — and worse,
  -- it establishes a pattern where self-notification is normal, which is
  -- exactly the assumption the guard below has to fight.
  if p_recipient = p_actor then
    return;
  end if;

  -- THE SECRECY GUARD.
  --
  -- pot_progress and pot_funded describe money being collected for a gift. If
  -- the subject is a pot whose beneficiary is the recipient, this notification
  -- announces their own present. Refusing silently rather than raising: a
  -- caller that gets this wrong should produce no notification, not a 500 in
  -- the middle of a payment webhook.
  if p_kind in ('pot_progress', 'pot_funded')
     and p_subject_type = 'pot'
     and exists (
       select 1 from private.pots
       where id = p_subject_id and owner_id = p_recipient
     )
  then
    return;
  end if;

  -- Same for anything keyed to a wish item the recipient owns. There is no
  -- reservation notification kind today, and this is what stops one being
  -- added carelessly tomorrow.
  if p_subject_type = 'wish_item'
     and exists (
       select 1 from public.wish_items
       where id = p_subject_id and owner_id = p_recipient
     )
     and p_kind not in ('wish_added', 'birthday_soon')
  then
    return;
  end if;

  insert into public.notifications
    (recipient_id, kind, actor_id, subject_type, subject_id, payload)
  values (p_recipient, p_kind, p_actor, p_subject_type, p_subject_id, p_payload);
end;
$$;

comment on function private.notify is
  'The one way a notification is created. The secrecy guard lives here rather than at each call site, because a guard repeated five times is a guard forgotten the sixth.';

-- ---------------------------------------------------------------------------
-- Friend requests
-- ---------------------------------------------------------------------------
create or replace function private.on_follow_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.state = 'pending' then
    perform private.notify(
      new.followee_id, 'friend_request', new.follower_id, 'profile', new.follower_id);

  elsif tg_op = 'UPDATE' and old.state = 'pending' and new.state = 'accepted' then
    -- The person who ASKED is told they were accepted; the accepter already
    -- knows what they just did.
    perform private.notify(
      new.follower_id, 'friend_accepted', new.followee_id, 'profile', new.followee_id);
  end if;

  return new;
end;
$$;

create trigger follows_notify
  after insert or update of state on public.follows
  for each row execute function private.on_follow_change();

-- ---------------------------------------------------------------------------
-- New wishes
-- ---------------------------------------------------------------------------
--
-- Friends want to know a list has grown. The list's OWNER does not need
-- telling about their own addition, which private.notify already handles.
create or replace function private.on_wish_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visibility public.visibility;
begin
  select visibility into v_visibility from public.wishlists where id = new.wishlist_id;

  -- A private list is private: its additions are nobody's business. 'link'
  -- is unlisted-by-design and must not surface in a feed either.
  if v_visibility <> 'friends' and v_visibility <> 'public' then
    return new;
  end if;

  -- Batched by the digest rather than sent per item: someone adding twelve
  -- wishes in one sitting should not produce twelve notifications.
  perform private.notify(
    f.follower_id, 'wish_added', new.owner_id, 'wishlist', new.wishlist_id,
    jsonb_build_object('wish_item_id', new.id)
  )
  from public.follows f
  where f.followee_id = new.owner_id
    and f.state = 'accepted'
    -- Only friends: a one-way follower of a 'friends' list cannot see it, so
    -- telling them it changed is both useless and a small leak.
    and exists (
      select 1 from public.follows back
      where back.follower_id = new.owner_id
        and back.followee_id = f.follower_id
        and back.state = 'accepted'
    );

  return new;
end;
$$;

create trigger wish_items_notify
  after insert on public.wish_items
  for each row execute function private.on_wish_added();

-- ---------------------------------------------------------------------------
-- Birthdays
-- ---------------------------------------------------------------------------
--
-- Run daily by pg_cron. Idempotent on (recipient, subject, day): a cron that
-- fires twice, or a retry after a failure, must not send two reminders.
create or replace function reco.notify_upcoming_birthdays(p_days int default 7)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  with upcoming as (
    select p.id as person_id, p.birthday
    from public.profiles p
    where p.birthday is not null
      -- Compare month and day only: the year on file is a birth year.
      and (
        make_date(
          extract(year from current_date)::int,
          extract(month from p.birthday)::int,
          extract(day from p.birthday)::int
        ) between current_date and current_date + p_days
      )
  ),
  friends_of as (
    select f.follower_id as notify, u.person_id, u.birthday
    from upcoming u
    join public.follows f
      on f.followee_id = u.person_id and f.state = 'accepted'
    where exists (
      select 1 from public.follows back
      where back.follower_id = u.person_id
        and back.followee_id = f.follower_id
        and back.state = 'accepted'
    )
  ),
  inserted as (
    insert into public.notifications
      (recipient_id, kind, actor_id, subject_type, subject_id, payload)
    select fo.notify, 'birthday_soon', fo.person_id, 'profile', fo.person_id,
           jsonb_build_object('date', fo.birthday)
    from friends_of fo
    -- Idempotent: one reminder per person per birthday per year.
    where not exists (
      select 1 from public.notifications n
      where n.recipient_id = fo.notify
        and n.kind = 'birthday_soon'
        and n.subject_id = fo.person_id
        and n.created_at > current_date - 300
    )
    returning 1
  )
  select count(*) into v_count from inserted;

  return v_count;
end;
$$;

comment on function reco.notify_upcoming_birthdays is
  'Daily birthday reminders. Idempotent within a 300-day window, so a cron that fires twice sends one reminder.';

-- ---------------------------------------------------------------------------
-- Reading the inbox
-- ---------------------------------------------------------------------------
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_n   integer;
begin
  if v_uid is null then
    raise exception 'not found' using errcode = '42704';
  end if;

  update public.notifications
  set read_at = now()
  where recipient_id = v_uid
    and read_at is null
    -- Null means "all of them", which is what the inbox screen does on open.
    and (p_ids is null or id = any(p_ids));

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.mark_notifications_read(uuid[]) from public;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

revoke all on all functions in schema private from anon, authenticated;
revoke all on all functions in schema reco from anon, authenticated;
