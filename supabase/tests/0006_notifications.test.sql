-- 0006_notifications.test.sql
--
-- Notifications, and the secrecy rule they must not route around.
--
-- A notification is prose delivered to a person. That makes it the most
-- natural place to accidentally say "Marc a réservé les AirPods" — which is
-- why the table has no free-text column and why every write goes through one
-- guarded function.
--
-- Run: psql -f supabase/tests/0006_notifications.test.sql

begin;
select plan(16);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'sophie-n@test.fr'),
  ('22222222-2222-2222-2222-222222222222', 'marc-n@test.fr'),
  ('33333333-3333-3333-3333-333333333333', 'lea-n@test.fr')
on conflict do nothing;

update public.profiles set handle='sophie_n',
       birthday = make_date(1990,
         extract(month from current_date + 3)::int,
         extract(day from current_date + 3)::int)
  where id='11111111-1111-1111-1111-111111111111';
update public.profiles set handle='marc_n' where id='22222222-2222-2222-2222-222222222222';
update public.profiles set handle='lea_n'  where id='33333333-3333-3333-3333-333333333333';

-- ---------------------------------------------------------------------------
-- 1. Friend requests
-- ---------------------------------------------------------------------------
insert into public.follows (follower_id, followee_id, state)
values ('22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111', 'pending');

select is(
  (select count(*)::int from public.notifications
   where recipient_id = '11111111-1111-1111-1111-111111111111'
     and kind = 'friend_request'),
  1,
  'a follow request notifies the person asked'
);

select is_empty(
  $$ select 1 from public.notifications
     where recipient_id = '22222222-2222-2222-2222-222222222222'
       and kind = 'friend_request' $$,
  'and not the person asking, who already knows'
);

update public.follows set state = 'accepted'
where follower_id = '22222222-2222-2222-2222-222222222222'
  and followee_id = '11111111-1111-1111-1111-111111111111';

select is(
  (select count(*)::int from public.notifications
   where recipient_id = '22222222-2222-2222-2222-222222222222'
     and kind = 'friend_accepted'),
  1,
  'accepting notifies the person who asked'
);

-- Make it mutual so the wish-added path has a friend to notify.
insert into public.follows (follower_id, followee_id, state)
values ('11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222', 'accepted');

-- ---------------------------------------------------------------------------
-- 2. New wishes
-- ---------------------------------------------------------------------------
insert into public.wishlists (id, owner_id, title, slug, visibility) values
  ('7777aaaa-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'Anniversaire', 'anniv-n', 'friends'),
  ('7777aaaa-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111', 'Secrète', 'secrete-n', 'private');

insert into public.wish_items (id, wishlist_id, owner_id, title, price_cents) values
  ('7777bbbb-0000-0000-0000-000000000001','7777aaaa-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111','AirPods', 27900);

select is(
  (select count(*)::int from public.notifications
   where recipient_id = '22222222-2222-2222-2222-222222222222'
     and kind = 'wish_added'),
  1,
  'a friend is told a list grew'
);

select is_empty(
  $$ select 1 from public.notifications
     where recipient_id = '11111111-1111-1111-1111-111111111111'
       and kind = 'wish_added' $$,
  'the owner is not told about their own addition'
);

-- A private list is private: its additions are nobody's business.
insert into public.wish_items (id, wishlist_id, owner_id, title, price_cents) values
  ('7777bbbb-0000-0000-0000-000000000002','7777aaaa-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111','Cadeau secret', 5000);

select is(
  (select count(*)::int from public.notifications
   where kind = 'wish_added'),
  1,
  'adding to a PRIVATE list notifies nobody'
);

-- A one-way follower cannot see a 'friends' list, so telling them it changed
-- is useless and a small leak.
insert into public.follows (follower_id, followee_id, state)
values ('33333333-3333-3333-3333-333333333333',
        '11111111-1111-1111-1111-111111111111', 'accepted');

insert into public.wish_items (id, wishlist_id, owner_id, title, price_cents) values
  ('7777bbbb-0000-0000-0000-000000000003','7777aaaa-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111','Chemex', 5200);

select is_empty(
  $$ select 1 from public.notifications
     where recipient_id = '33333333-3333-3333-3333-333333333333'
       and kind = 'wish_added' $$,
  'a one-way follower is not notified about a friends-only list'
);

-- ---------------------------------------------------------------------------
-- 3. THE SECRECY GUARD
-- ---------------------------------------------------------------------------
insert into private.pots (id, wish_item_id, owner_id, target_cents) values
  ('7777cccc-0000-0000-0000-000000000001','7777bbbb-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 100000);

-- The direct attempt: notify the beneficiary about their own pot.
select lives_ok(
  $$ select private.notify(
       '11111111-1111-1111-1111-111111111111', 'pot_progress',
       '22222222-2222-2222-2222-222222222222', 'pot',
       '7777cccc-0000-0000-0000-000000000001') $$,
  'notifying a pot beneficiary does not error'
);

select is_empty(
  $$ select 1 from public.notifications
     where recipient_id = '11111111-1111-1111-1111-111111111111'
       and kind in ('pot_progress','pot_funded') $$,
  'but it produces NOTHING — the beneficiary is never told about their own pot'
);

select lives_ok(
  $$ select private.notify(
       '11111111-1111-1111-1111-111111111111', 'pot_funded',
       '22222222-2222-2222-2222-222222222222', 'pot',
       '7777cccc-0000-0000-0000-000000000001') $$,
  'pot_funded to the beneficiary is refused the same way'
);

-- A contributor, by contrast, is told.
select lives_ok(
  $$ select private.notify(
       '22222222-2222-2222-2222-222222222222', 'pot_progress',
       '33333333-3333-3333-3333-333333333333', 'pot',
       '7777cccc-0000-0000-0000-000000000001') $$,
  'a contributor can be notified'
);

select isnt_empty(
  $$ select 1 from public.notifications
     where recipient_id = '22222222-2222-2222-2222-222222222222'
       and kind = 'pot_progress' $$,
  'and the notification exists'
);

-- Anything keyed to a wish item the recipient owns is refused too, which is
-- what stops a reservation notification kind being added carelessly later.
select is_empty(
  $$ select 1 from public.notifications n
     join public.wish_items wi on wi.id = n.subject_id
     where n.subject_type = 'wish_item'
       and wi.owner_id = n.recipient_id
       and n.kind not in ('wish_added','birthday_soon') $$,
  'no notification about a wish item reaches the person who owns it'
);

-- ---------------------------------------------------------------------------
-- 4. Structure: no free text
-- ---------------------------------------------------------------------------
--
-- The whole reason "Marc a réservé les AirPods" cannot be generated is that
-- there is nowhere to write it.
select is_empty(
  $$ select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'notifications'
       and column_name in ('message','body','text','title','description') $$,
  'the notifications table has no free-text column to write prose into'
);

-- ---------------------------------------------------------------------------
-- 5. Birthdays, and the idempotency a cron needs
-- ---------------------------------------------------------------------------
select ok(
  reco.notify_upcoming_birthdays(7) >= 1,
  'an upcoming birthday notifies the friend'
);

select is(
  reco.notify_upcoming_birthdays(7),
  0,
  'running the cron twice sends nothing a second time'
);

select * from finish();
rollback;
