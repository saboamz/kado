-- 0005_payments.test.sql
--
-- The contribution state machine.
--
-- Two claims are load-bearing: an unpaid intent cannot inflate a pot, and a
-- redelivered webhook cannot double-count. Stripe delivers at least once and
-- retries on success, so the second is not hypothetical.
--
-- Run: psql -f supabase/tests/0005_payments.test.sql

begin;
select plan(21);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'sophie-p@test.fr'),
  ('22222222-2222-2222-2222-222222222222', 'marc-p@test.fr'),
  ('33333333-3333-3333-3333-333333333333', 'lea-p@test.fr')
on conflict do nothing;

update public.profiles set handle='sophie_p' where id='11111111-1111-1111-1111-111111111111';
update public.profiles set handle='marc_p'   where id='22222222-2222-2222-2222-222222222222';
update public.profiles set handle='lea_p'    where id='33333333-3333-3333-3333-333333333333';

insert into public.follows (follower_id, followee_id, state) values
  ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','accepted'),
  ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','accepted')
on conflict do nothing;

insert into public.wishlists (id, owner_id, title, slug, visibility) values
  ('9a9a0000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'Anniversaire', 'anniv-p', 'friends');

insert into public.wish_items (id, wishlist_id, owner_id, title, price_cents, is_pot) values
  ('9b9b0000-0000-0000-0000-000000000001','9a9a0000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111','MacBook Air', 100000, true);

insert into private.pots (id, wish_item_id, owner_id, target_cents) values
  ('9c9c0000-0000-0000-0000-000000000001','9b9b0000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 100000);

-- ---------------------------------------------------------------------------
-- 1. An unpaid intent is invisible
-- ---------------------------------------------------------------------------
insert into private.contributions (pot_id, contributor_id, amount_cents, psp_intent_id)
values ('9c9c0000-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222', 40000, 'pi_test_1');

select is(
  (select state from private.contributions where psp_intent_id = 'pi_test_1'),
  'pending'::public.contribution_state,
  'a new contribution starts pending'
);

-- The rule the whole design rests on. get_pot_state sums only captured rows,
-- so an intent nobody paid for cannot make the pot look funded.
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(
  (select raised_cents from public.get_pot_state('9b9b0000-0000-0000-0000-000000000001')),
  0::bigint,
  'a pending contribution does NOT count toward the total'
);
reset role;

-- ---------------------------------------------------------------------------
-- 2. Capture
-- ---------------------------------------------------------------------------
select is(
  private.handle_psp_event('evt_1', 'payment_intent.succeeded', 'pi_test_1', '{}'::jsonb),
  'applied',
  'a succeeded event captures the contribution'
);

select is(
  (select state from private.contributions where psp_intent_id = 'pi_test_1'),
  'captured'::public.contribution_state,
  'the contribution is captured'
);

select isnt(
  (select captured_at from private.contributions where psp_intent_id = 'pi_test_1'),
  null,
  'and stamped with when'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(
  (select raised_cents from public.get_pot_state('9b9b0000-0000-0000-0000-000000000001')),
  40000::bigint,
  'a captured contribution DOES count'
);
reset role;

-- ---------------------------------------------------------------------------
-- 3. Idempotency
-- ---------------------------------------------------------------------------
--
-- Stripe delivers at least once and retries on success. Without the event-id
-- primary key doing the deduplication, this is where a pot silently doubles.
select is(
  private.handle_psp_event('evt_1', 'payment_intent.succeeded', 'pi_test_1', '{}'::jsonb),
  'duplicate',
  'the SAME event id is recognised as a redelivery'
);

select is(
  (select count(*)::int from private.contributions
   where psp_intent_id = 'pi_test_1' and state = 'captured'),
  1,
  'and captures nothing a second time'
);

-- A DIFFERENT event id for an already-captured intent: the transition guard
-- catches it even though the deduplication does not.
select is(
  private.handle_psp_event('evt_1b', 'payment_intent.succeeded', 'pi_test_1', '{}'::jsonb),
  'no matching contribution',
  'a second event for an already-captured intent changes nothing'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(
  (select raised_cents from public.get_pot_state('9b9b0000-0000-0000-0000-000000000001')),
  40000::bigint,
  'the total did not double'
);
reset role;

-- ---------------------------------------------------------------------------
-- 4. Failure
-- ---------------------------------------------------------------------------
insert into private.contributions (pot_id, contributor_id, amount_cents, psp_intent_id)
values ('9c9c0000-0000-0000-0000-000000000001',
        '33333333-3333-3333-3333-333333333333', 20000, 'pi_test_2');

select is(
  private.handle_psp_event('evt_2', 'payment_intent.payment_failed', 'pi_test_2', '{}'::jsonb),
  'applied',
  'a failed payment marks the contribution failed'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(
  (select raised_cents from public.get_pot_state('9b9b0000-0000-0000-0000-000000000001')),
  40000::bigint,
  'a failed payment adds nothing to the total'
);
reset role;

-- ---------------------------------------------------------------------------
-- 5. Funding, and refunding back out of it
-- ---------------------------------------------------------------------------
insert into private.contributions (pot_id, contributor_id, amount_cents, psp_intent_id)
values ('9c9c0000-0000-0000-0000-000000000001',
        '33333333-3333-3333-3333-333333333333', 60000, 'pi_test_3');

select is(
  private.handle_psp_event('evt_3', 'payment_intent.succeeded', 'pi_test_3', '{}'::jsonb),
  'applied',
  'the contribution that reaches the target captures'
);

select is(
  (select state from private.pots where id = '9c9c0000-0000-0000-0000-000000000001'),
  'funded'::public.pot_state,
  'the pot closes as funded the moment the money lands'
);

select is(
  private.handle_psp_event('evt_4', 'charge.refunded', 'pi_test_3', '{}'::jsonb),
  'applied',
  'a refund is applied'
);

select is(
  (select state from private.pots where id = '9c9c0000-0000-0000-0000-000000000001'),
  'open'::public.pot_state,
  'and reopens the pot, because the gift is no longer paid for'
);

-- A refund for something never captured is a Stripe-side inconsistency and
-- must not be accepted as if money had moved.
select is(
  private.handle_psp_event('evt_5', 'charge.refunded', 'pi_test_2', '{}'::jsonb),
  'no matching contribution',
  'a refund on a failed contribution is refused'
);

-- ---------------------------------------------------------------------------
-- 6. Unknown events, and the secrecy rule
-- ---------------------------------------------------------------------------
select is(
  private.handle_psp_event('evt_6', 'customer.created', null, '{}'::jsonb),
  'ignored',
  'an unhandled event type is recorded and ignored, not retried forever'
);

-- The beneficiary must never be told about their own pot. A pot_progress
-- notification addressed to them announces their present.
select is_empty(
  $$ select 1 from public.notifications
     where recipient_id = '11111111-1111-1111-1111-111111111111'
       and kind in ('pot_progress', 'pot_funded') $$,
  'the pot''s beneficiary is never notified about it'
);

select isnt_empty(
  $$ select 1 from public.notifications
     where recipient_id = '22222222-2222-2222-2222-222222222222'
       and kind = 'pot_progress' $$,
  'but the contributors are'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select throws_ok(
  $$ select 1 from private.psp_events $$,
  '42501', null,
  'a client cannot read the payment event log'
);
reset role;

select * from finish();
rollback;
