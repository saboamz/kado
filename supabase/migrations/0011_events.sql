-- 0011_events.sql
--
-- The interaction log. It is three things at once: the training set for
-- recommendations, the analytics record, and the trail that explains why a
-- given recommendation appeared months after it did.
--
-- WHY IT LIVES IN `reco` AND NOT IN `public`
--
-- Rows of kind `reserve`, `purchase` and `contribute` are keyed to the wish
-- items they touched, which means the log knows exactly what an owner must not
-- learn. A `public.gift_events` table would hand the whole secrecy model back
-- through the side door: `?actor_id=eq.<me>&kind=eq.reserve` reconstructs the
-- reservation table from the events that produced it.
--
-- So `reco` is unexposed for the same reason `private` is, and the client
-- reaches it only through the one RPC at the bottom of this file.

create table reco.gift_events (
  id           bigint generated always as identity primary key,

  actor_id     uuid not null references public.profiles (id) on delete cascade,
  kind         public.event_kind not null,

  -- Whose list this touched. Null for pure browsing, which has no recipient.
  recipient_id uuid references public.profiles (id) on delete set null,

  product_id   uuid references public.products (id) on delete set null,
  wish_item_id uuid references public.wish_items (id) on delete set null,
  category_id  uuid references public.categories (id) on delete set null,

  -- Denormalised at write time. A price is a fact about the moment of the
  -- event; joining to products later would read today's price and quietly
  -- rewrite history every time a merchant runs a sale.
  price_cents  integer,

  -- Confidence, not a rating. Looked up server-side from the table below so a
  -- client cannot declare its own view worth as much as a purchase.
  weight       real not null,

  session_id   uuid,

  -- Set when the event followed a recommendation, which is what makes
  -- per-strategy conversion measurable at all.
  source       public.reco_strategy,

  occurred_at  timestamptz not null default now()
);

create index gift_events_actor
  on reco.gift_events (actor_id, occurred_at desc);

create index gift_events_product
  on reco.gift_events (product_id, kind)
  where product_id is not null;

-- The index the collaborative-filtering matrix is built from: giver × product,
-- restricted to the events that mean "gave", which is the signal CF learns.
create index gift_events_cf
  on reco.gift_events (actor_id, product_id)
  where kind in ('reserve', 'purchase', 'contribute') and product_id is not null;

comment on table reco.gift_events is
  'Append-only interaction log. In `reco` because reserve/purchase rows would otherwise reconstruct the reservation table through PostgREST.';
comment on column reco.gift_events.price_cents is
  'Denormalised deliberately: the price at the time of the event, not the price today.';
comment on column reco.gift_events.weight is
  'Implicit-feedback confidence, resolved server-side. A client-supplied weight is a client-supplied ranking.';

-- ---------------------------------------------------------------------------
-- Weights
-- ---------------------------------------------------------------------------
--
-- A table rather than a CASE expression, so they can be retuned by an UPDATE
-- and so a query can join to them. The ordering is the argument:
-- money changing hands outranks intent, intent outranks a click, and a view is
-- barely evidence at all.
create table reco.event_weights (
  kind   public.event_kind primary key,
  weight real not null,
  note   text
);

insert into reco.event_weights (kind, weight, note) values
  ('purchase',     10.0, 'Strongest possible: money changed hands.'),
  ('reserve',       6.0, 'Committed intent — a promise to buy.'),
  ('contribute',    5.0, 'Committed intent, shared with others.'),
  ('add_wish',      3.0, 'Taste signal for the ADDER, not a giving signal.'),
  ('like_wish',     1.5, 'Weak positive.'),
  ('click_out',     1.0, 'Left for the merchant.'),
  ('view_wish',     0.5, 'Noisy; needs session de-duplication to mean much.'),
  ('view_product',  0.3, 'Noisier still.'),
  ('unreserve',    -3.0, 'Reversal: a held gift given up is evidence against.'),
  ('dismiss_reco', -2.0, 'Explicit negative; affects ranking only.');

comment on table reco.event_weights is
  'Implicit-feedback confidences. add_wish is deliberately a signal about the adder, not about giving — mixing the two would train the model on the wrong axis.';

-- ---------------------------------------------------------------------------
-- The one client-facing write path
-- ---------------------------------------------------------------------------
create or replace function public.log_event(
  p_kind      public.event_kind,
  p_product   uuid default null,
  p_wish_item uuid default null,
  p_recipient uuid default null,
  p_session   uuid default null,
  p_source    public.reco_strategy default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_w   real;
begin
  -- Silently ignore anonymous events rather than raising: telemetry must never
  -- be able to break a page, and a signed-out visitor has nothing to log.
  if v_uid is null then return; end if;

  -- THE WHITELIST.
  --
  -- Browsing events only. reserve, purchase, contribute and unreserve are
  -- written by their own RPCs as a side effect of the action actually
  -- happening. If a client could log them, anyone could inflate a product into
  -- every recommendation slate by POSTing purchases in a loop — and the
  -- resulting model would be indistinguishable from a working one until
  -- someone looked at why the same item kept winning.
  if p_kind not in ('view_product', 'view_wish', 'like_wish',
                    'click_out', 'dismiss_reco') then
    raise exception 'event kind % is not client-loggable', p_kind
      using errcode = '42501';
  end if;

  select weight into v_w from reco.event_weights where kind = p_kind;

  insert into reco.gift_events
    (actor_id, kind, recipient_id, product_id, wish_item_id,
     price_cents, weight, session_id, source)
  select v_uid, p_kind, p_recipient, p_product, p_wish_item,
         wi.price_cents, coalesce(v_w, 1), p_session, p_source
  from (select 1) dummy
  left join public.wish_items wi on wi.id = p_wish_item;
end;
$$;

comment on function public.log_event is
  'The only client write into the event log, and only for browsing kinds. Giving events are written by the RPCs that perform them.';

-- ---------------------------------------------------------------------------
-- Server-side recording of the events that matter most
-- ---------------------------------------------------------------------------
--
-- Called from reserve_item / release_item / contribute, so a giving event
-- exists exactly when the thing it records actually happened.
create or replace function reco.record_gift_event(
  p_actor     uuid,
  p_kind      public.event_kind,
  p_recipient uuid,
  p_wish_item uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_w real;
begin
  select weight into v_w from reco.event_weights where kind = p_kind;

  insert into reco.gift_events
    (actor_id, kind, recipient_id, product_id, wish_item_id,
     category_id, price_cents, weight)
  select p_actor, p_kind, p_recipient, wi.product_id, wi.id,
         p.category_id, wi.price_cents, coalesce(v_w, 1)
  from public.wish_items wi
  left join public.products p on p.id = wi.product_id
  where wi.id = p_wish_item;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on all tables in schema reco from anon, authenticated;
revoke all on all functions in schema reco from anon, authenticated;

revoke all on function public.log_event(
  public.event_kind, uuid, uuid, uuid, uuid, public.reco_strategy) from public;
grant execute on function public.log_event(
  public.event_kind, uuid, uuid, uuid, uuid, public.reco_strategy) to authenticated;

alter table reco.gift_events enable row level security;
alter table reco.gift_events force  row level security;
alter table reco.event_weights enable row level security;
alter table reco.event_weights force  row level security;
-- No policies at all: nothing reaches these tables except SECURITY DEFINER
-- functions. Defence in depth behind the unexposed schema.
