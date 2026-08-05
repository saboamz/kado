-- 0015_payments.sql
--
-- The contribution state machine, and the webhook that drives it.
--
-- THE RULE THIS ENFORCES
--
-- Only a CAPTURED contribution counts toward a pot total. get_pot_state()
-- already sums `where state = 'captured'`, so an intent that is never paid
-- cannot inflate the total — but until now nothing ever moved a row out of
-- `pending`, which made every contribution permanently invisible.
--
-- Money is the one place where being wrong twice is much worse than being
-- wrong once, so the design is built around idempotency: Stripe retries
-- webhooks, and it retries them on success too.

-- ---------------------------------------------------------------------------
-- Webhook deduplication
-- ---------------------------------------------------------------------------
--
-- Stripe delivers at least once, not exactly once. Without this table a
-- retried `payment_intent.succeeded` would be processed twice, and if the
-- handler ever became non-idempotent the pot would silently double-count.
create table private.psp_events (
  -- Stripe's own event id. The primary key IS the deduplication.
  id           text primary key,
  type         text not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  -- Kept for forensics: a payment dispute six months from now is answered from
  -- this column, not from a log that has rotated away.
  payload      jsonb not null
);

create index psp_events_unprocessed
  on private.psp_events (received_at)
  where processed_at is null;

comment on table private.psp_events is
  'Stripe event ids, so an at-least-once webhook becomes exactly-once. The primary key is the deduplication.';

alter table private.psp_events enable row level security;
alter table private.psp_events force  row level security;

-- ---------------------------------------------------------------------------
-- State transitions
-- ---------------------------------------------------------------------------
--
-- One function per transition rather than a generic setter, so each one can
-- state its own guard. A `set state = $1` helper would make every future
-- caller responsible for knowing which transitions are legal.
create or replace function private.capture_contribution(
  p_intent_id text,
  p_event_id  text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid;
  v_pot    uuid;
  v_owner  uuid;
begin
  -- Idempotent by construction: only a row still `pending` moves, so a
  -- redelivered event finds nothing to do and reports it honestly.
  update private.contributions
  set state = 'captured', captured_at = now()
  where psp_intent_id = p_intent_id
    and state = 'pending'
  returning id, pot_id into v_id, v_pot;

  if v_id is null then
    return false;
  end if;

  -- A pot that has reached its target closes. Checked here rather than by a
  -- cron sweep so the state is correct the instant the money lands.
  update private.pots p
  set state = 'funded'
  where p.id = v_pot
    and p.state = 'open'
    and (select coalesce(sum(c.amount_cents), 0)
         from private.contributions c
         where c.pot_id = p.id and c.state = 'captured') >= p.target_cents;

  -- Notify the CONTRIBUTORS, never the beneficiary. pot_funded addressed to
  -- the person the pot is for would announce their own present.
  select owner_id into v_owner from private.pots where id = v_pot;

  insert into public.notifications (recipient_id, kind, subject_type, subject_id, payload)
  -- Cast explicitly: with an empty search_path the literal does not resolve
  -- to the enum on its own.
  select distinct c.contributor_id, 'pot_progress'::public.notif_kind, 'pot', v_pot,
         jsonb_build_object('event', 'contribution_captured')
  from private.contributions c
  where c.pot_id = v_pot
    and c.state = 'captured'
    and c.contributor_id <> v_owner;

  return true;
end;
$$;

comment on function private.capture_contribution is
  'Moves a pending contribution to captured. Idempotent: a redelivered webhook finds no pending row and returns false.';

create or replace function private.fail_contribution(
  p_intent_id text,
  p_event_id  text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update private.contributions
  set state = 'failed'
  where psp_intent_id = p_intent_id
    and state = 'pending'
  returning id into v_id;

  return v_id is not null;
end;
$$;

create or replace function private.refund_contribution(
  p_intent_id text,
  p_event_id  text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id  uuid;
  v_pot uuid;
begin
  -- Only a captured contribution can be refunded. A pending one that gets a
  -- refund event is a Stripe-side inconsistency and must not be quietly
  -- accepted as if the money had moved.
  update private.contributions
  set state = 'refunded'
  where psp_intent_id = p_intent_id
    and state = 'captured'
  returning id, pot_id into v_id, v_pot;

  if v_id is null then
    return false;
  end if;

  -- A refund can take a funded pot back below its target. Reopening it is
  -- correct: the gift is not paid for any more.
  update private.pots p
  set state = 'open'
  where p.id = v_pot
    and p.state = 'funded'
    and (select coalesce(sum(c.amount_cents), 0)
         from private.contributions c
         where c.pot_id = p.id and c.state = 'captured') < p.target_cents;

  return true;
end;
$$;

comment on function private.refund_contribution is
  'Refunds a captured contribution and reopens the pot if it drops below target. A refund on a pending row is refused: the money never moved.';

-- ---------------------------------------------------------------------------
-- The webhook entry point
-- ---------------------------------------------------------------------------
--
-- Called by the Edge Function AFTER it has verified Stripe's signature. The
-- signature check cannot live here — it needs the raw request body and the
-- webhook secret — which is exactly why this function is in `private` and
-- reachable only with the service role.
create or replace function private.handle_psp_event(
  p_event_id   text,
  p_event_type text,
  p_intent_id  text,
  p_payload    jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new boolean;
  v_did boolean;
begin
  -- Record first. If this insert conflicts the event is a redelivery, and the
  -- whole handler becomes a no-op — which is the entire idempotency strategy
  -- and the reason it is one statement rather than a check-then-act.
  insert into private.psp_events (id, type, payload)
  values (p_event_id, p_event_type, p_payload)
  on conflict (id) do nothing;

  get diagnostics v_new = row_count;
  if v_new = false or v_new is null then
    return 'duplicate';
  end if;

  case p_event_type
    when 'payment_intent.succeeded' then
      v_did := private.capture_contribution(p_intent_id, p_event_id);
    when 'payment_intent.payment_failed' then
      v_did := private.fail_contribution(p_intent_id, p_event_id);
    when 'charge.refunded' then
      v_did := private.refund_contribution(p_intent_id, p_event_id);
    else
      -- An event type we do not handle is recorded and ignored. Stripe sends
      -- many; treating an unknown one as an error would retry it forever.
      update private.psp_events set processed_at = now() where id = p_event_id;
      return 'ignored';
  end case;

  update private.psp_events set processed_at = now() where id = p_event_id;
  return case when v_did then 'applied' else 'no matching contribution' end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Client-visible: my own contributions
-- ---------------------------------------------------------------------------
--
-- A contributor may see what they paid, in every state, because it is their
-- own money. Note this returns nothing about anyone else's contributions and
-- nothing about the pot's beneficiary.
create or replace function public.my_contributions()
returns table (
  pot_id       uuid,
  amount_cents integer,
  currency     char(3),
  state        public.contribution_state,
  created_at   timestamptz
)
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

  return query
  select c.pot_id, c.amount_cents, c.currency, c.state, c.created_at
  from private.contributions c
  where c.contributor_id = v_uid
  order by c.created_at desc;
end;
$$;

revoke all on function public.my_contributions() from public;
grant execute on function public.my_contributions() to authenticated;

revoke all on all tables in schema private from anon, authenticated;
revoke all on all functions in schema private from anon, authenticated;
